import { z } from "zod";

/**
 * Templates de mensagens WhatsApp (ver .context/WHATSAPP_EVOLUTION.md §4).
 * Variáveis validadas com zod; corpo determinístico (testes golden).
 */

export const OPT_OUT_FOOTER = "Responda SAIR para não receber mais mensagens.";

const quoteDeliverySchema = z.object({
  recipientName: z.string().min(1),
  eventTitle: z.string().min(1),
  eventDate: z.string().min(1),
  totalFormatted: z.string().min(1),
  link: z.string().url(),
});

export function renderQuoteDelivery(raw: z.input<typeof quoteDeliverySchema>): string {
  const vars = quoteDeliverySchema.parse(raw);
  return [
    `Olá, ${vars.recipientName}.`,
    "",
    `A cotação do seu evento "${vars.eventTitle}" (${vars.eventDate}) está pronta.`,
    `Total estimado: ${vars.totalFormatted}.`,
    `Veja os detalhes: ${vars.link}`,
    "",
    OPT_OUT_FOOTER,
  ].join("\n");
}

const paymentReminderSchema = z.object({
  recipientName: z.string().min(1),
  amountFormatted: z.string().min(1),
  expiresInLabel: z.string().min(1),
  link: z.string().url(),
});

export function renderPaymentReminder(raw: z.input<typeof paymentReminderSchema>): string {
  const vars = paymentReminderSchema.parse(raw);
  return [
    `Olá, ${vars.recipientName}.`,
    "",
    `Seu pagamento de ${vars.amountFormatted} aguarda confirmação — ${vars.expiresInLabel}.`,
    `Pague com Pix: ${vars.link}`,
    "",
    OPT_OUT_FOOTER,
  ].join("\n");
}

const eventReadySchema = z.object({
  recipientName: z.string().min(1),
  eventTitle: z.string().min(1),
  link: z.string().url(),
});

export function renderEventReady(raw: z.input<typeof eventReadySchema>): string {
  const vars = eventReadySchema.parse(raw);
  return [
    `Olá, ${vars.recipientName}.`,
    "",
    `O orçamento do evento "${vars.eventTitle}" está liberado.`,
    `Acesse: ${vars.link}`,
    "",
    OPT_OUT_FOOTER,
  ].join("\n");
}

export function renderOptOutConfirmation(): string {
  return "Pronto. Você não receberá mais mensagens da EventeIA por este canal.";
}

const testimonialInviteSchema = z.object({
  recipientName: z.string().min(1),
  eventTitle: z.string().min(1),
  link: z.string().url(),
});

const quotationSummarySchema = z.object({
  eventTitle: z.string().min(1),
  lines: z
    .array(
      z.object({
        vendor: z.string().min(1),
        category: z.string().min(1),
        amountFormatted: z.string().min(1),
      }),
    )
    .min(1),
  totalFormatted: z.string().min(1),
  link: z.string().url(),
});

/** Resumo das cotações do evento, enviado ao anfitrião/planner. */
export function renderQuotationSummary(raw: z.input<typeof quotationSummarySchema>): string {
  const vars = quotationSummarySchema.parse(raw);
  const lines = vars.lines.map(
    (line) => `- ${line.category}: ${line.vendor} — ${line.amountFormatted}`,
  );

  return [
    `Resumo das cotações do evento "${vars.eventTitle}":`,
    "",
    ...lines,
    "",
    `Total das propostas: ${vars.totalFormatted}`,
    `Ver no painel: ${vars.link}`,
    "",
    OPT_OUT_FOOTER,
  ].join("\n");
}

/** Convite pós-evento para contar a história (disparado pela fila). */
export function renderTestimonialInvite(raw: z.input<typeof testimonialInviteSchema>): string {
  const vars = testimonialInviteSchema.parse(raw);
  return [
    `Oi, ${vars.recipientName}.`,
    "",
    `A festa "${vars.eventTitle}" já passou — e a sua história pode ajudar outras famílias a decidir com mais clareza.`,
    `Se quiser contar como foi, é só abrir: ${vars.link}`,
    "Você decide se publicamos.",
    "",
    OPT_OUT_FOOTER,
  ].join("\n");
}
