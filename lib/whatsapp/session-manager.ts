/**
 * Orquestra o ciclo de vida efêmero com dependências injetadas (testável).
 * A implementação real (Supabase/Evolution/BullMQ) vive em session-runtime.ts.
 */

import type { QuotationsReadyReason } from "@/lib/notifications/quotations-ready";

import {
  assertTransition,
  computeDrainAtMs,
  isCollectionComplete,
  resolveCollectionWindowMinutes,
  toSessionState,
  type SessionState,
} from "./session-lifecycle";

export interface SessionDeps {
  now(): number;
  getStatus(instance: string): Promise<string | null>;
  setStatus(
    instance: string,
    state: SessionState,
    extra?: { eventId?: string; windowMinutes?: number; drainAtMs?: number },
  ): Promise<void>;
  /** Logout gracioso na Evolution (encerra a sessão do WhatsApp do cliente). */
  logout(instance: string): Promise<void>;
  /** Pausa apenas os jobs pendentes DESTE evento (não a fila global). */
  pauseEventJobs(eventId: string): Promise<void>;
  /** Retoma os jobs DESTE evento (remove a pausa deixada por uma queda anterior). */
  resumeEventJobs?(eventId: string): Promise<void>;
  scheduleWindowEnd(instance: string, eventId: string, delayMs: number): Promise<void>;
  /** Encerra a coleta já (meta atingida). Job distinto do agendado para 48h. */
  triggerCollectionEnd(instance: string | null, eventId: string): Promise<void>;
  /**
   * Entrega as cotações (fase 4: cenários/budget_snapshots). Executada ANTES do
   * logout: a sessão só desconecta depois que as cotações foram entregues.
   */
  deliverQuotes(eventId: string): Promise<void>;
  notifyQuotationsReady(eventId: string, reason: QuotationsReadyReason): Promise<void>;
  warn(message: string, context: Record<string, unknown>): void;
}

export async function activateSession(
  deps: SessionDeps,
  input: { instance: string; eventId: string; windowMinutes?: number },
): Promise<{ drainAtMs: number; windowMinutes: number }> {
  const current = toSessionState((await deps.getStatus(input.instance)) ?? "connecting");
  // Reativar uma sessão já ativa é idempotente (reagenda a janela).
  if (current !== "active") {
    assertTransition(current, "active");
  }

  const windowMinutes = resolveCollectionWindowMinutes(input.windowMinutes);
  const nowMs = deps.now();
  const drainAtMs = computeDrainAtMs(nowMs, windowMinutes);

  await deps.setStatus(input.instance, "active", {
    eventId: input.eventId,
    windowMinutes,
    drainAtMs,
  });
  await deps.scheduleWindowEnd(input.instance, input.eventId, drainAtMs - nowMs);
  // Reconectou: a fila do evento não pode continuar pausada por uma queda anterior.
  await deps.resumeEventJobs?.(input.eventId);
  return { drainAtMs, windowMinutes };
}

/**
 * Fim da coleta (48h ou meta atingida): draining → entrega as cotações →
 * logout gracioso → disconnected → notifica. Se a entrega falhar, a sessão
 * fica em draining e o erro sobe (o job tenta de novo com backoff).
 */
export async function endCollectionWindow(
  deps: SessionDeps,
  input: { instance: string; eventId: string; reason?: "window_closed" | "collection_complete" },
): Promise<"closed" | "already_closed"> {
  const current = toSessionState((await deps.getStatus(input.instance)) ?? "disconnected");
  if (current === "disconnected") {
    return "already_closed";
  }

  if (current !== "draining") {
    await deps.setStatus(input.instance, "draining");
  }

  await deps.deliverQuotes(input.eventId);

  try {
    await deps.logout(input.instance);
  } catch (error) {
    // Logout falho não impede encerrar localmente; sessão será tratada como perdida.
    deps.warn("logout da Evolution falhou", {
      instance: input.instance,
      reason: error instanceof Error ? error.message : "desconhecido",
    });
  }

  await deps.setStatus(input.instance, "disconnected");
  await deps.notifyQuotationsReady(input.eventId, input.reason ?? "window_closed");
  return "closed";
}

/** Sessão inválida/desconectada: marca, pausa os jobs do evento e avisa o app. */
export async function handleSessionLost(
  deps: SessionDeps,
  input: { instance: string; eventId: string },
): Promise<"handled" | "already_disconnected"> {
  const current = toSessionState((await deps.getStatus(input.instance)) ?? "disconnected");
  await deps.pauseEventJobs(input.eventId);
  if (current === "disconnected") {
    return "already_disconnected";
  }
  await deps.setStatus(input.instance, "disconnected");
  await deps.notifyQuotationsReady(input.eventId, "session_lost");
  return "handled";
}

/**
 * Chamado a cada cotação registrada (fase 3): se todas as categorias atingiram
 * a meta, dispara o encerramento imediato da coleta. Idempotente.
 */
export async function completeCollectionIfReady(
  deps: SessionDeps,
  input: {
    instance: string;
    eventId: string;
    quotesByCategory: Readonly<Record<string, number>>;
    categories: readonly string[];
  },
): Promise<"triggered" | "pending" | "not_active"> {
  const current = toSessionState((await deps.getStatus(input.instance)) ?? "disconnected");
  if (current !== "active") return "not_active";
  if (!isCollectionComplete(input.quotesByCategory, input.categories)) return "pending";
  await deps.triggerCollectionEnd(input.instance, input.eventId);
  return "triggered";
}

/**
 * Fim da coleta para o evento, com ou sem sessão ativa (worker do ciclo de vida).
 * - Sessão ativa/draining ⇒ endCollectionWindow (entrega → logout → notifica).
 * - Sem sessão (simulação, sessão perdida antes) ⇒ entrega + notifica direto.
 * Entrega e notificação são idempotentes.
 */
export async function finishCollection(
  deps: SessionDeps,
  input: {
    instance: string | null;
    eventId: string;
    reason: "window_closed" | "collection_complete";
  },
): Promise<"closed" | "delivered_without_session"> {
  const state =
    input.instance === null
      ? "disconnected"
      : toSessionState((await deps.getStatus(input.instance)) ?? "disconnected");
  if (input.instance !== null && state !== "disconnected") {
    await endCollectionWindow(deps, {
      instance: input.instance,
      eventId: input.eventId,
      reason: input.reason,
    });
    return "closed";
  }
  await deps.deliverQuotes(input.eventId);
  await deps.notifyQuotationsReady(input.eventId, input.reason);
  return "delivered_without_session";
}
