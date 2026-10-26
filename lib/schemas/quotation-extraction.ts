/**
 * Schema da extração de cotações (DeepSeek) — Agente Orçamentista.
 * Valores SEMPRE em centavos inteiros. Texto do fornecedor é dado NÃO confiável.
 */

import { z } from "zod";

import { normalizeScopeItem } from "@/lib/quotes/scope-items";

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

/**
 * Escopo estruturado: cada item "inclui" ou "nao_inclui", com preço à parte
 * quando o fornecedor informar (ex.: louça não inclusa, R$ 3/pessoa).
 */
export const scopeEntrySchema = z.object({
  item: z.string().trim().min(1).max(60).transform(normalizeScopeItem),
  status: z.enum(["inclui", "nao_inclui"]),
  price_cents: centsSchema.nullable().default(null),
  notes: z.string().trim().max(200).optional(),
});

export type ScopeEntry = z.infer<typeof scopeEntrySchema>;

/**
 * Opção/pacote que o fornecedor ofereceu (ex.: "Pacote prata", "Pacote ouro").
 * Preço em centavos; null = "a combinar". O usuário escolhe no painel do evento.
 */
export const quoteOptionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  includes: z.array(z.string().trim().max(60)).max(20).optional(),
  amount_cents: centsSchema.nullable().default(null),
});

export type QuoteOption = z.infer<typeof quoteOptionSchema>;

export const nuancedQuotationSchema = z.object({
  total_price_cents: centsSchema.nullable(),
  base_price_cents: centsSchema.nullable(),
  mandatory_fees: z.array(mandatoryFeeSchema).max(30),
  item_breakdown: z.array(itemBreakdownSchema).max(100),
  scope: z.array(scopeEntrySchema).max(40).default([]),
  options: z.array(quoteOptionSchema).max(15).default([]),
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
export const EMPTY_QUOTATION: Readonly<NuancedQuotation> = Object.freeze({
  total_price_cents: null,
  base_price_cents: null,
  mandatory_fees: [],
  item_breakdown: [],
  scope: [],
  options: [],
  validity_days: null,
  payment_conditions: null,
  confidence_score: 0,
});
