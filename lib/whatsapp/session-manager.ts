/**
 * Orquestra o ciclo de vida efêmero com dependências injetadas (testável).
 * A implementação real (Supabase/Evolution/BullMQ) vive em session-runtime.ts.
 */

import type { QuotationsReadyReason } from "@/lib/notifications/quotations-ready";

import {
  assertTransition,
  computeDrainAtMs,
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
  scheduleWindowEnd(instance: string, eventId: string, delayMs: number): Promise<void>;
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

  await deps.setStatus(input.instance, "active", { eventId: input.eventId, windowMinutes, drainAtMs });
  await deps.scheduleWindowEnd(input.instance, input.eventId, drainAtMs - nowMs);
  return { drainAtMs, windowMinutes };
}

/** Fim da janela de coleta: draining → logout gracioso → disconnected → notifica. */
export async function endCollectionWindow(
  deps: SessionDeps,
  input: { instance: string; eventId: string },
): Promise<"closed" | "already_closed"> {
  const current = toSessionState((await deps.getStatus(input.instance)) ?? "disconnected");
  if (current === "disconnected") {
    return "already_closed";
  }

  if (current !== "draining") {
    await deps.setStatus(input.instance, "draining");
  }

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
  await deps.notifyQuotationsReady(input.eventId, "window_closed");
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
