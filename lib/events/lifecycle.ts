/**
 * Ciclo de vida do evento (puro e determinístico).
 *
 * Status canônicos (.context/DATABASE_RLS.md):
 *   draft → awaiting_payment → active → completed
 *   qualquer status não-terminal → canceled (soft delete; nunca DELETE físico)
 *
 * - "Encerrar" só faz sentido a partir de um evento ativo (o evento aconteceu).
 * - "Excluir" é soft delete: marca `canceled` e remove o evento das listas.
 */

export type EventStatus = "draft" | "awaiting_payment" | "active" | "completed" | "canceled";

const EVENT_STATUSES = new Set<EventStatus>([
  "draft",
  "awaiting_payment",
  "active",
  "completed",
  "canceled",
]);

export function isEventStatus(value: string): value is EventStatus {
  return EVENT_STATUSES.has(value as EventStatus);
}

/** Encerrar exige evento ativo (coleta/orçamento em andamento). */
export function canCompleteEvent(status: string): boolean {
  return isEventStatus(status) && status === "active";
}

/** Excluir = soft delete; um evento já cancelado não pode ser excluído de novo. */
export function canCancelEvent(status: string): boolean {
  return isEventStatus(status) && status !== "canceled";
}

/**
 * Palavra digitada pelo admin para confirmar o cancelamento em massa.
 * A ação é um UPDATE filtrado (nunca DELETE), mas atinge vários eventos de uma
 * vez — por isso exige confirmação explícita e não apenas um clique.
 */
export const BULK_CANCEL_CONFIRMATION = "CANCELAR";

export function isBulkCancelConfirmed(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim().toUpperCase() === BULK_CANCEL_CONFIRMATION
  );
}
