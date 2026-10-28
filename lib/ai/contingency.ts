import { formatEventDate, type SupplierReply, type SupplierReplyContext } from "@/lib/quotes/triage";
import { EMPTY_QUOTATION, type NuancedQuotation } from "@/lib/schemas/quotation-extraction";
import { detectOptOut } from "@/lib/prospecting/opt-out";

/** Parsers determinísticos: o fluxo nunca trava quando todos os LLMs falham. */

/** Converte "R$ 1.500,00" / "1500 reais" em centavos. */
export function parseBRLAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?:R\$\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*reais)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").replace(/\./g, "");
    const [int, dec = "0"] = raw.split(",");
    const cents = Number(int) * 100 + Number(dec.padEnd(2, "0").slice(0, 2));
    if (Number.isFinite(cents) && cents > 0 && cents <= 100_000_000) out.push(cents);
  }
  return out;
}

const FEE_HINTS: [RegExp, "cleaning" | "dishes_and_cutlery" | "delivery_pickup" | "service_staff"][] = [
  [/limpeza/i, "cleaning"],
  [/lou[cç]a|talher/i, "dishes_and_cutlery"],
  [/frete|entrega|retirada|desloca/i, "delivery_pickup"],
  [/gar[cç]o|monitor|equipe|staff/i, "service_staff"],
];

/** Contingência da extração: maior valor = total; linhas com dica de taxa viram taxas. Confiança baixa. */
export function contingencyQuotation(text: string): NuancedQuotation {
  const amounts = parseBRLAmounts(text);
  const fees: NuancedQuotation["mandatory_fees"] = [];
  for (const line of text.split(/\n|;|\+|,\s(?=\D)/)) {
    const hint = FEE_HINTS.find(([re]) => re.test(line));
    const value = parseBRLAmounts(line)[0];
    if (hint !== undefined && value !== undefined) {
      fees.push({ category: hint[1], description: line.trim().slice(0, 200) || "Taxa", amount_cents: value, included_in_base: false });
    }
  }
  const total = amounts.length > 0 ? Math.max(...amounts) : null;
  return { ...EMPTY_QUOTATION, mandatory_fees: fees.slice(0, 30), item_breakdown: [], scope: [], total_price_cents: total, base_price_cents: null, confidence_score: total === null ? 0 : 0.3 };
}

/** Contingência de opt-out: regras fixas (sair, parar, não tenho interesse…). */
export function contingencyOptOut(text: string): { opt_out: boolean; confidence_score: number } {
  return { opt_out: detectOptOut(text), confidence_score: 0.6 };
}

export type FirstReplyIntent = "quote" | "needs_info" | "decline" | "later" | "other";

/** Contingência da 1ª resposta do fornecedor: preço ⇒ quote; recusa ⇒ decline; pergunta ⇒ needs_info. */
export function contingencyFirstReply(text: string): {
  intent: FirstReplyIntent;
  has_price: boolean;
  questions: string[];
  confidence_score: number;
} {
  const hasPrice = parseBRLAmounts(text).length > 0;
  const questions = text
    .split(/(?<=\?)/)
    .map((q) => q.trim())
    .filter((q) => q.endsWith("?"))
    .slice(0, 5)
    .map((q) => q.slice(0, 300));
  let intent: FirstReplyIntent = "other";
  if (detectOptOut(text)) intent = "decline";
  else if (hasPrice) intent = "quote";
  else if (questions.length > 0) intent = "needs_info";
  else if (/depois|amanh[ãa]|mais tarde|retorno|j[áa] te (passo|mando)/i.test(text)) intent = "later";
  return { intent, has_price: hasPrice, questions, confidence_score: 0.4 };
}

/** Contingência da varredura de taxas ocultas: reaproveita as dicas por linha. */
export function contingencyHiddenFees(text: string): {
  fees: NuancedQuotation["mandatory_fees"];
  confidence_score: number;
} {
  return { fees: contingencyQuotation(text).mandatory_fees, confidence_score: 0.3 };
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Contingência da classificação: categoria permitida cujo nome (ou radical) aparece no texto. */
export function contingencyClassification(
  text: string,
  allowed: readonly string[],
): { category: string | null; confidence_score: number } {
  const haystack = fold(text);
  const hit = allowed.find((c) =>
    fold(c)
      .split(/[_\s-]+/)
      .some((word) => word.length >= 4 && haystack.includes(word.slice(0, Math.max(4, word.length - 1)))),
  );
  return { category: hit ?? null, confidence_score: hit === undefined ? 0 : 0.4 };
}

/**
 * Contingência da resposta ao fornecedor (quando nenhum LLM está disponível):
 * resposta cordial usando SÓ o contexto do evento, sem inventar valores.
 */
export function contingencySupplierReply(context: SupplierReplyContext): SupplierReply {
  const name = context.vendorName.trim().slice(0, 60) || "tudo bem";
  const where = context.city.trim().length > 0 ? ` em ${context.city.trim()}` : "";
  const reply = `Olá, ${name}! Obrigado pelo retorno. Somos uma empresa que faz orçamentos para eventos — o evento "${context.eventTitle}" está previsto para ${formatEventDate(context.eventDateIso)}${where}, para ${context.guestCount} convidados (${context.categoryLabel}). Pode me confirmar os valores e o que está incluso?`;
  return { kind: "question", reply: reply.slice(0, 600), confidence_score: 0.5 };
}
