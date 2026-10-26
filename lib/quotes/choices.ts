import { z } from "zod";

import { formatBRL } from "@/lib/money";
import { quoteOptionSchema, type QuoteOption } from "@/lib/schemas/quotation-extraction";

/**
 * Escolhas do fornecedor (puro e determinístico).
 *
 * A extração do coletor grava `extraction.quotation.options` (ver lib/quotes/collector.ts);
 * aqui lemos essa estrutura com zod na fronteira do banco e resolvemos a opção escolhida.
 */

const extractionOptionsSchema = z.object({
  quotation: z
    .object({ options: z.array(quoteOptionSchema).max(15).optional() })
    .partial()
    .optional(),
  options: z.array(quoteOptionSchema).max(15).optional(),
});

/** Opções extraídas de uma cotação; `[]` quando não há (ou o formato é desconhecido). */
export function parseQuotationOptions(extraction: unknown): QuoteOption[] {
  const parsed = extractionOptionsSchema.safeParse(extraction);
  if (!parsed.success) return [];
  return parsed.data.quotation?.options ?? parsed.data.options ?? [];
}

/** Resolve a opção pelo índice (0..n-1). Fora do intervalo ⇒ null. */
export function resolveChoiceOption(
  options: readonly QuoteOption[],
  index: number,
): QuoteOption | null {
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return null;
  return options[index] ?? null;
}

/** "R$ 1.500,00" ou "a combinar" (opção sem preço explícito). */
export function formatOptionPrice(option: QuoteOption): string {
  return option.amount_cents === null ? "a combinar" : formatBRL(option.amount_cents);
}

/** Mensagem humana ao fornecedor confirmando a escolha (sem URLs e sem rodapé de bot). */
export function renderChoiceMessage(input: {
  vendorName: string;
  eventTitle: string;
  option: QuoteOption;
}): string {
  const vendor = input.vendorName.trim().slice(0, 60) || "tudo bem";
  const option = input.option.name.trim().slice(0, 120);
  return `Olá, ${vendor}! Escolhemos a opção "${option}" (${formatOptionPrice(input.option)}) para o evento "${input.eventTitle}". Podemos seguir com ela?`;
}
