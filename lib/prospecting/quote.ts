import { z } from "zod";

/**
 * Cotação estruturada coletada na DM (produto, especificações, volume/MOQ,
 * preço, prazo, frete, pagamento e validade). Valores monetários em centavos
 * inteiros; nada de float.
 */

export const structuredQuoteSchema = z.object({
  product: z.string().trim().min(1).max(200),
  specifications: z.string().trim().max(1000).nullable(),
  volume: z.number().int().nonnegative().nullable(),
  moq: z.number().int().positive().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  /** Preço unitário por convidado/pessoa (ex.: "R$ 85 por convidado"), em centavos. */
  unitPriceCents: z.number().int().nonnegative().nullish(),
  deadlineDays: z.number().int().nonnegative().nullable(),
  shippingCents: z.number().int().nonnegative().nullable(),
  paymentTerms: z.string().trim().max(300).nullable(),
  validUntil: z.string().trim().max(40).nullable(),
});

export type StructuredQuote = z.infer<typeof structuredQuoteSchema>;

/** Valida o JSON devolvido pelo agente; null quando não é uma cotação válida. */
export function parseStructuredQuote(raw: unknown): StructuredQuote | null {
  const parsed = structuredQuoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const INT_FIELDS = ["volume", "moq", "deadlineDays"] as const;
const CENTS_FIELDS = ["priceCents", "unitPriceCents", "shippingCents"] as const;
const TEXT_FIELDS = ["specifications", "paymentTerms", "validUntil"] as const;

/** "60 pessoas" → 60; "1.200" → 1200; texto sem número → null. */
function toInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const match = /\d[\d.]*(,\d+)?/.exec(value);
  if (match === null) return null;
  const n = Number(match[0].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Valida a cotação de forma tolerante: converte números em texto e descarta
 * (null) só os campos opcionais inválidos. Sem `product` válido → null.
 * Strings monetárias só são aceitas quando são número puro em centavos.
 */
/**
 * Preço por convidado: com o número de convidados conhecido, o total é
 * unitário × convidados. Corrige o caso em que o modelo pôs o unitário em
 * priceCents (priceCents === unitPriceCents).
 */
function withPerGuestTotal(quote: StructuredQuote): StructuredQuote {
  const unit = quote.unitPriceCents;
  if (unit === null || unit === undefined || quote.volume === null || quote.volume <= 0)
    return quote;
  if (quote.priceCents !== null && quote.priceCents !== unit) return quote;
  return { ...quote, priceCents: unit * quote.volume };
}

export function coerceStructuredQuote(raw: unknown): StructuredQuote | null {
  if (raw === null || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const candidate: Record<string, unknown> = {
    product: typeof input.product === "string" ? input.product : null,
  };
  for (const key of TEXT_FIELDS) {
    const v = input[key];
    candidate[key] = typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
  }
  for (const key of INT_FIELDS) candidate[key] = toInt(input[key]);
  for (const key of CENTS_FIELDS) {
    const v = input[key];
    candidate[key] =
      typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : null;
  }
  const shape = structuredQuoteSchema.shape;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const field = shape[key].safeParse(candidate[key]);
    if (field.success) out[key] = field.data;
    else if (key === "product") return null;
    else out[key] = null;
  }
  return withPerGuestTotal(out as StructuredQuote);
}
