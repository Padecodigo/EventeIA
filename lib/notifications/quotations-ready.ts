/**
 * Notificação "quotations_ready": fim da coleta de cotações.
 * Idempotente por evento (idempotency_key UNIQUE). Dependências injetadas.
 */

import { categoryLabel } from "@/lib/quotes/labels";

import type { EmailAdapter } from "./email";
import type { QuotationsReadyReadiness } from "./readiness";

export type QuotationsReadyReason = "window_closed" | "collection_complete" | "session_lost";

export interface OwnerContact {
  profileId: string;
  email: string | null;
  displayName: string;
  eventTitle: string;
}

export interface NotificationDeps {
  getOwnerContact(eventId: string): Promise<OwnerContact | null>;
  /** Insere com ON CONFLICT DO NOTHING; retorna o id quando inseriu. */
  insertNotification(row: {
    profileId: string;
    eventId: string;
    idempotencyKey: string;
    payload: {
      reason: QuotationsReadyReason;
      event_title: string;
      readiness: QuotationsReadyReadiness;
    };
  }): Promise<string | null>;
  markEmailSent(notificationId: string): Promise<void>;
  email: EmailAdapter;
  warn(message: string, context: Record<string, unknown>): void;
}

export function quotationsReadyKey(eventId: string): string {
  return `quotations_ready:${eventId}`;
}

export function renderQuotationsReadyEmail(input: {
  displayName: string;
  eventTitle: string;
  reason: QuotationsReadyReason;
  readiness: QuotationsReadyReadiness;
}): { subject: string; text: string } {
  const why =
    input.reason === "window_closed"
      ? "O prazo de 24h de coleta terminou"
      : input.reason === "session_lost"
        ? "A coleta foi interrompida"
        : input.readiness.status === "complete"
          ? "Recebemos as cotações necessárias"
          : "A coleta foi encerrada";

  if (input.readiness.status === "complete") {
    return {
      subject: `Seu orçamento de "${input.eventTitle}" está pronto`,
      text: [
        `Olá, ${input.displayName}.`,
        "",
        `${why} e a busca de orçamentos para "${input.eventTitle}" foi concluída.`,
        "O orçamento de menor preço já está organizado no seu painel.",
        "",
        "Com carinho,",
        "Equipe EventeIA",
      ].join("\n"),
    };
  }

  if (input.readiness.status === "incomplete") {
    const pending = [...new Set(input.readiness.uncovered.map(categoryLabel))];
    const missing =
      pending.length > 0
        ? `Ainda faltam cotações válidas para: ${pending.join(", ")}.`
        : "Ainda faltam cotações válidas para algumas necessidades.";
    return {
      subject: `Coleta de cotações de "${input.eventTitle}" encerrada com pendências`,
      text: [
        `Olá, ${input.displayName}.`,
        "",
        `${why} e a busca de orçamentos para "${input.eventTitle}" foi concluída.`,
        missing,
        "O orçamento de menor preço só pode ser confirmado quando todas as necessidades estiverem cobertas.",
        "Você pode acompanhar as pendências no seu painel.",
        "",
        "Com carinho,",
        "Equipe EventeIA",
      ].join("\n"),
    };
  }

  return {
    subject: `Coleta de cotações de "${input.eventTitle}" encerrada`,
    text: [
      `Olá, ${input.displayName}.`,
      "",
      `${why} e a busca de orçamentos para "${input.eventTitle}" foi concluída.`,
      "Não recebemos cotações válidas para este evento.",
      "Não há orçamento para confirmar o menor preço; nossa equipe pode ajudar nos próximos passos.",
      "",
      "Com carinho,",
      "Equipe EventeIA",
    ].join("\n"),
  };
}

export async function recordQuotationsReady(
  deps: NotificationDeps,
  input: { eventId: string; reason: QuotationsReadyReason; readiness: QuotationsReadyReadiness },
): Promise<"created" | "duplicate" | "no_owner"> {
  const owner = await deps.getOwnerContact(input.eventId);
  if (owner === null) {
    return "no_owner";
  }

  const notificationId = await deps.insertNotification({
    profileId: owner.profileId,
    eventId: input.eventId,
    idempotencyKey: quotationsReadyKey(input.eventId),
    payload: {
      reason: input.reason,
      event_title: owner.eventTitle,
      readiness: input.readiness,
    },
  });

  if (notificationId === null) {
    return "duplicate";
  }

  if (owner.email !== null) {
    try {
      const content = renderQuotationsReadyEmail({
        displayName: owner.displayName,
        eventTitle: owner.eventTitle,
        reason: input.reason,
        readiness: input.readiness,
      });
      await deps.email.send({ to: owner.email, ...content, eventId: input.eventId });
      await deps.markEmailSent(notificationId);
    } catch (error) {
      // E-mail falho não desfaz a notificação in-app.
      deps.warn("falha ao enviar e-mail quotations_ready", {
        eventId: input.eventId,
        reason: error instanceof Error ? error.message : "desconhecido",
      });
    }
  }

  return "created";
}
