/**
 * Notificação "quotations_ready": fim da coleta + desconexão segura do WhatsApp.
 * Idempotente por evento (idempotency_key UNIQUE). Dependências injetadas.
 */

import type { EmailAdapter } from "./email";

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
    payload: { reason: QuotationsReadyReason; event_title: string };
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
}): { subject: string; text: string } {
  const why =
    input.reason === "window_closed"
      ? "O prazo de 24h de coleta terminou"
      : input.reason === "collection_complete"
        ? "Recebemos as cotações necessárias"
        : "A conexão com o seu WhatsApp caiu";
  return {
    subject: `Suas cotações de "${input.eventTitle}" estão prontas`,
    text: [
      `Olá, ${input.displayName}.`,
      "",
      `${why} e a busca de orçamentos para "${input.eventTitle}" foi concluída.`,
      "Por segurança, a conexão com o seu WhatsApp foi encerrada pela EventeIA.",
      "As propostas recebidas já estão organizadas no seu painel.",
      "",
      "Com carinho,",
      "Equipe EventeIA",
    ].join("\n"),
  };
}

export async function recordQuotationsReady(
  deps: NotificationDeps,
  input: { eventId: string; reason: QuotationsReadyReason },
): Promise<"created" | "duplicate" | "no_owner"> {
  const owner = await deps.getOwnerContact(input.eventId);
  if (owner === null) {
    return "no_owner";
  }

  const notificationId = await deps.insertNotification({
    profileId: owner.profileId,
    eventId: input.eventId,
    idempotencyKey: quotationsReadyKey(input.eventId),
    payload: { reason: input.reason, event_title: owner.eventTitle },
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
