import { z } from "zod";

import type { FirstReplyIntent } from "@/lib/ai/contingency";
import type { MandatoryFee, NuancedQuotation } from "@/lib/schemas/quotation-extraction";
import { OPT_OUT_FOOTER } from "@/lib/whatsapp/templates";

/**
 * Fase 3 — coleta: inbound do fornecedor → extração (roteador) → rascunho em `quotations`.
 * Confiança baixa ⇒ pergunta de esclarecimento (no máx. MAX_FOLLOWUPS por fornecedor).
 * Cada cotação aproveitável reavalia a regra de fim (5 por categoria ou 48h).
 * Módulo puro: I/O injetado (testável). Texto do fornecedor = dado NÃO confiável.
 */

export const QUOTE_MIN_CONFIDENCE = 0.7;
export const MAX_FOLLOWUPS = 2;
export const MAX_RAW_TEXT = 8_000;

export const quoteExtractionJobSchema = z.object({
  eventId: z.string().uuid(),
  prospectId: z.string().uuid(),
});
export type QuoteExtractionJob = z.infer<typeof quoteExtractionJobSchema>;

export type AiProvider = "deepseek" | "nim" | "grok" | "contingency";

export interface Routed<T> {
  value: T;
  provider: AiProvider;
}

export interface CollectorContext {
  eventId: string;
  collectionEnded: boolean;
  prospect: { id: string; name: string; category: string; phone: string; supplierId: string | null };
  /** Mensagens inbound do fornecedor neste evento, em ordem. */
  inboundText: string;
}

export interface DraftRow {
  eventId: string;
  prospectId: string;
  supplierId: string | null;
  category: string;
  vendorName: string;
  vendorContact: string;
  amountCents: number;
  feesCents: number;
  rawText: string;
  extraction: {
    quotation: NuancedQuotation;
    fees: MandatoryFee[];
    first_reply: FirstReplyIntent;
    questions: string[];
  };
  confidence: number;
  provider: AiProvider;
  needsFollowup: boolean;
  followupCount: number;
}

export interface CollectorDeps {
  loadContext(job: QuoteExtractionJob): Promise<CollectorContext | null>;
  getFollowupCount(eventId: string, prospectId: string): Promise<number>;
  firstReply(text: string, eventId?: string): Promise<Routed<{ intent: FirstReplyIntent; questions: string[] }>>;
  extract(text: string, eventId?: string): Promise<Routed<NuancedQuotation>>;
  hiddenFees(text: string, eventId?: string): Promise<Routed<{ fees: MandatoryFee[] }>>;
  saveDraft(row: DraftRow): Promise<void>;
  sendFollowUp(input: { eventId: string; prospectId: string; phone: string; text: string; n: number }): Promise<
    "sent" | "dry_run" | "skipped"
  >;
  /** Reavalia o fim da coleta (meta por categoria) e dispara a fase 4 se completa. */
  checkCollectionEnd(eventId: string): Promise<"triggered" | "pending" | "not_active">;
}

/** Junta taxas do extrator com as da varredura (sem duplicar categoria). */
export function mergeFees(fromQuote: readonly MandatoryFee[], scanned: readonly MandatoryFee[]): MandatoryFee[] {
  const seen = new Set(fromQuote.map((f) => f.category));
  const extra = scanned.filter((f) => f.category === "other" || !seen.has(f.category));
  return [...fromQuote, ...extra].slice(0, 30);
}

/** Soma (centavos) das taxas obrigatórias NÃO incluídas no preço base. */
export function extraFeesCents(fees: readonly MandatoryFee[]): number {
  return fees.reduce((sum, f) => sum + (f.included_in_base ? 0 : f.amount_cents), 0);
}

/**
 * Total final: o informado; senão base + taxas extras. Confiança: a do extrator, limitada a
 * 0,3 quando veio da contingência determinística.
 */
export function resolveQuote(
  quotation: NuancedQuotation,
  fees: readonly MandatoryFee[],
  provider: AiProvider,
): { amountCents: number | null; feesCents: number; confidence: number } {
  const feesCents = extraFeesCents(fees);
  const amountCents =
    quotation.total_price_cents ?? (quotation.base_price_cents === null ? null : quotation.base_price_cents + feesCents);
  const confidence = provider === "contingency" ? Math.min(0.3, quotation.confidence_score) : quotation.confidence_score;
  return { amountCents, feesCents, confidence: Math.round(confidence * 100) / 100 };
}

export function isUsableQuote(amountCents: number | null, confidence: number): boolean {
  return amountCents !== null && amountCents > 0 && confidence >= QUOTE_MIN_CONFIDENCE;
}

/** Pergunta curta e educada pedindo só o que falta. */
export function buildFollowUp(vendorName: string, missing: { total: boolean; fees: boolean }): string {
  const asks: string[] = [];
  if (missing.total) asks.push("o valor total do serviço");
  if (missing.fees) asks.push("se há taxas à parte (limpeza, frete, louça ou equipe) e seus valores");
  const what = asks.length > 0 ? asks.join(" e ") : "os valores do orçamento";
  const name = vendorName.trim().slice(0, 60) || "tudo bem";
  return `Olá, ${name}! Obrigado pelo retorno. Para comparar certinho, pode me confirmar ${what}? ${OPT_OUT_FOOTER}`;
}

export type CollectorOutcome =
  | { status: "skipped" | "declined" }
  | { status: "usable" | "followup" | "incomplete"; end: "triggered" | "pending" | "not_active" };

export async function processQuoteMessage(deps: CollectorDeps, job: QuoteExtractionJob): Promise<CollectorOutcome> {
  const ctx = await deps.loadContext(job);
  if (ctx === null || ctx.collectionEnded) return { status: "skipped" };
  const text = ctx.inboundText.slice(-MAX_RAW_TEXT).trim();
  if (text.length === 0) return { status: "skipped" };

  const first = await deps.firstReply(text, ctx.eventId);
  if (first.value.intent === "decline") return { status: "declined" };

  const [quote, scan] = await Promise.all([deps.extract(text, ctx.eventId), deps.hiddenFees(text, ctx.eventId)]);
  const fees = mergeFees(quote.value.mandatory_fees, scan.value.fees);
  const resolved = resolveQuote(quote.value, fees, quote.provider);
  const usable = isUsableQuote(resolved.amountCents, resolved.confidence);

  let followupCount = await deps.getFollowupCount(ctx.eventId, ctx.prospect.id);
  let followedUp = false;
  // "later" = fornecedor avisou que responde depois: não insistir.
  if (!usable && followupCount < MAX_FOLLOWUPS && first.value.intent !== "later") {
    const sent = await deps.sendFollowUp({
      eventId: ctx.eventId,
      prospectId: ctx.prospect.id,
      phone: ctx.prospect.phone,
      text: buildFollowUp(ctx.prospect.name, {
        total: resolved.amountCents === null,
        fees: resolved.confidence < QUOTE_MIN_CONFIDENCE,
      }),
      n: followupCount + 1,
    });
    if (sent !== "skipped") {
      followupCount += 1;
      followedUp = true;
    }
  }

  await deps.saveDraft({
    eventId: ctx.eventId,
    prospectId: ctx.prospect.id,
    supplierId: ctx.prospect.supplierId,
    category: ctx.prospect.category,
    vendorName: ctx.prospect.name,
    vendorContact: ctx.prospect.phone,
    amountCents: resolved.amountCents ?? 0,
    feesCents: resolved.feesCents,
    rawText: text,
    extraction: { quotation: quote.value, fees, first_reply: first.value.intent, questions: first.value.questions },
    confidence: resolved.confidence,
    provider: quote.provider,
    needsFollowup: !usable,
    followupCount,
  });

  const end = await deps.checkCollectionEnd(ctx.eventId);
  return { status: usable ? "usable" : followedUp ? "followup" : "incomplete", end };
}

/** Contagem de cotações aproveitáveis por categoria (para a regra dos 5). */
export function countUsableByCategory(
  rows: readonly { category: string; amount_cents: number; confidence: number | null; needs_followup: boolean }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.needs_followup && isUsableQuote(r.amount_cents, r.confidence ?? 0)) {
      out[r.category] = (out[r.category] ?? 0) + 1;
    }
  }
  return out;
}

/** Categorias que precisam de cotação (exclui a pergunta aberta "outros"). */
export function quotableCategories(requirements: readonly { category: string }[]): string[] {
  return [...new Set(requirements.map((r) => r.category))].filter((c) => c !== "outros").sort();
}
