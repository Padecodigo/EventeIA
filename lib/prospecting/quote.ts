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
