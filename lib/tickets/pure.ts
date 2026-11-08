/**
 * Tíquete avulso (comprável sem evento) — regras puras, sem I/O.
 * Preço nasce no servidor (env B2C_TICKET_PRICE_CENTS); default R$ 97,00.
 */

export const DEFAULT_TICKET_PRICE_CENTS = 9_700;

export type TicketPurchaseStatus = "pending" | "active" | "consumed" | "refunded" | "canceled";

/** Status que representam um ticket já disponível para ser consumido. */
export const AVAILABLE_STATUS = "active" as const;

/** Propósito de cobrança do ticket avulso (payments.purpose). */
export const TICKET_CREDIT_PURPOSE = "ticket_credit" as const;

/**
 * Preço do ticket avulso em centavos inteiros. Lê B2C_TICKET_PRICE_CENTS do
 * ambiente injetado (nunca lê process.env — mantém a função pura e testável).
 */
export function ticketPriceCents(env: Record<string, string | undefined> = {}): number {
  const raw = env.B2C_TICKET_PRICE_CENTS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TICKET_PRICE_CENTS;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TICKET_PRICE_CENTS;
}

export interface TicketLike {
  status: TicketPurchaseStatus;
  event_id: string | null;
  created_at: string;
}

/** Um ticket está disponível para consumo quando ativo e sem evento vinculado. */
export function isAvailableTicket(
  ticket: Pick<TicketLike, "status" | "event_id">,
): boolean {
  return ticket.status === AVAILABLE_STATUS && ticket.event_id === null;
}

/**
 * Menor `created_at` primeiro (FIFO). Empates são resolvidos no banco
 * (`order by created_at, id` na função consume_available_ticket).
 */
export function pickOldestAvailable<T extends TicketLike>(
  tickets: readonly T[],
): T | null {
  const available = tickets.filter(isAvailableTicket);
  if (available.length === 0) {
    return null;
  }
  return available.reduce((oldest, current) =>
    current.created_at < oldest.created_at ? current : oldest,
  );
}

const ALLOWED_TRANSITIONS: Record<TicketPurchaseStatus, readonly TicketPurchaseStatus[]> = {
  pending: ["active", "refunded", "canceled"],
  active: ["consumed", "refunded", "canceled"],
  consumed: [],
  refunded: [],
  canceled: [],
};

/** Máquina de estados do tíquete avulso (pending → active → consumed). */
export function isTicketStatusTransitionAllowed(
  from: TicketPurchaseStatus,
  to: TicketPurchaseStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Chave de idempotência da compra do ticket avulso (1 ticket por cobrança Asaas). */
export function ticketCreditIdempotencyKey(asaasPaymentId: string): string {
  return `${TICKET_CREDIT_PURPOSE}:${asaasPaymentId}`;
}
