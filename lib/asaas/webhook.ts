/**
 * Lógica pura de classificação de webhooks do Asaas (testável sem rede/banco).
 * O processamento transacional acontece em `process_payment_webhook` (SQL).
 */

export type LocalPaymentStatus =
  | "pending"
  | "paid"
  | "confirmed"
  | "overdue"
  | "refunded"
  | "risk_review"
  | "chargeback";

export interface WebhookClassification {
  status: LocalPaymentStatus;
  activatesTicket: boolean;
}

const CLASSIFICATION_BY_EVENT: Record<string, WebhookClassification> = {
  PAYMENT_CREATED: { status: "pending", activatesTicket: false },
  PAYMENT_RECEIVED: { status: "paid", activatesTicket: true },
  PAYMENT_CONFIRMED: { status: "paid", activatesTicket: true },
  PAYMENT_OVERDUE: { status: "overdue", activatesTicket: false },
  PAYMENT_REFUNDED: { status: "refunded", activatesTicket: false },
  PAYMENT_AWAITING_RISK_ANALYSIS: { status: "risk_review", activatesTicket: false },
  PAYMENT_CHARGEBACK_REQUESTED: { status: "chargeback", activatesTicket: false },
};

export function classifyAsaasEvent(eventName: string): WebhookClassification | null {
  return CLASSIFICATION_BY_EVENT[eventName] ?? null;
}

/** Matriz de transições permitidas (§6 de PAYMENTS.md). */
const ALLOWED_TRANSITIONS: Record<LocalPaymentStatus, readonly LocalPaymentStatus[]> = {
  pending: ["paid", "overdue", "risk_review", "refunded"],
  overdue: ["paid", "pending", "chargeback"],
  paid: ["refunded", "chargeback"],
  confirmed: ["refunded", "chargeback"],
  risk_review: ["paid", "refunded", "chargeback"],
  refunded: [],
  chargeback: [],
};

export function isTransitionAllowed(from: LocalPaymentStatus, to: LocalPaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
