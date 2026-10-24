import { EMPTY_QUOTATION, type NuancedQuotation } from "@/lib/schemas/quotation-extraction";
import { detectOptOut } from "@/lib/schemas/whatsapp";

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
  return { ...EMPTY_QUOTATION, mandatory_fees: fees.slice(0, 30), item_breakdown: [], total_price_cents: total, base_price_cents: null, confidence_score: total === null ? 0 : 0.3 };
}

/** Contingência de opt-out: regras fixas (sair, parar, não tenho interesse…). */
export function contingencyOptOut(text: string): { opt_out: boolean; confidence_score: number } {
  return { opt_out: detectOptOut(text), confidence_score: 0.6 };
}
