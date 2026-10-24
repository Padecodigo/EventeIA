/**
 * Schema da extração de cotações (DeepSeek) — Agente Orçamentista.
 * Valores SEMPRE em centavos inteiros. Texto do fornecedor é dado NÃO confiável.
 */

import { z } from "zod";

export const FEE_CATEGORIES = [
  "cleaning",
  "dishes_and_cutlery",
  "delivery_pickup",
  "service_staff",
  "other",
] as const;

export type FeeCategory = (typeof FEE_CATEGORIES)[number];

const centsSchema = z.number().int().min(0).max(100_000_000);

export const mandatoryFeeSchema = z.object({
  category: z.enum(FEE_CATEGORIES),
  description: z.string().trim().min(1).max(200),
  amount_cents: centsSchema,
  included_in_base: z.boolean(),
});

export type MandatoryFee = z.infer<typeof mandatoryFeeSchema>;

export const itemBreakdownSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(0).max(100_000).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const nuancedQuotationSchema = z.object({
  total_price_cents: centsSchema.nullable(),
  base_price_cents: centsSchema.nullable(),
  mandatory_fees: z.array(mandatoryFeeSchema).max(30),
  item_breakdown: z.array(itemBreakdownSchema).max(100),
  validity_days: z.number().int().min(0).max(365).nullable(),
  payment_conditions: z.string().trim().max(500).nullable(),
  confidence_score: z.number().min(0).max(1),
});

export type NuancedQuotation = z.infer<typeof nuancedQuotationSchema>;

export type ExtractionStatus = "success" | "parsing_failed" | "failed";

export interface QuotationExtractionResult {
  status: ExtractionStatus;
  quotation: NuancedQuotation;
  /** Problemas de validação (sem o texto do fornecedor — evita PII em logs). */
  issues: string[];
}

/** Extração vazia/segura usada em falhas — nunca estima valores. */
export const EMPTY_QUOTATION: NuancedQuotation = Object.freeze({
  total_price_cents: null,
  base_price_cents: null,
  mandatory_fees: [],
  item_breakdown: [],
  validity_days: null,
  payment_conditions: null,
  confidence_score: 0,
}) as NuancedQuotation;
