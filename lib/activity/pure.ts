import { formatBRL } from "@/lib/money";

/**
 * Mapeamento puro de eventos de sistema → texto humano do histórico.
 * Extraído de lib/activity.ts (server-only) para ser testável.
 */

export interface ActivityItem {
  id: string;
  type: string;
  label: string;
  detail?: string;
  occurredAt: string;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  "event.created": "Evento criado",
  "event.activated": "Evento ativado",
  "payment.created": "Cobrança gerada",
  "payment.confirmed": "Pagamento confirmado",
  "payment.overdue": "Pagamento vencido",
  "payment.refunded": "Pagamento reembolsado",
  "quotation.created": "Cotação registrada",
  "quotation.dispatched": "Resumo enviado no WhatsApp",
  "credits.granted": "Créditos adicionados",
  "credits.consumed": "Crédito consumido",
  "credits.expired": "Créditos expirados",
  "testimonial.invited": "Convite de depoimento enviado",
  "testimonial.submitted": "Depoimento recebido",
  "testimonial.published": "Depoimento publicado",
  "testimonial.rejected": "Depoimento rejeitado",
  "testimonial.unpublished": "Depoimento despublicado",
  "profile.updated": "Perfil atualizado",
  "consent.opted_in": "WhatsApp autorizado",
  "consent.opted_out": "WhatsApp revogado",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? type;
}

export function activityDetailFromPayload(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.amount_cents === "number") {
    return formatBRL(record.amount_cents);
  }
  if (typeof record.credits === "number") {
    return `${String(record.credits)} crédito(s)`;
  }
  if (typeof record.quotations === "number") {
    return `${String(record.quotations)} cotação(ões)`;
  }
  if (typeof record.channel === "string") {
    return record.channel === "whatsapp" ? "WhatsApp" : record.channel;
  }
  return undefined;
}
