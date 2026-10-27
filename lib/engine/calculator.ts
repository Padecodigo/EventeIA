/**
 * Custo efetivo de uma cotação real (puro, determinístico, centavos inteiros).
 * Efetivo = base + Σ(taxas obrigatórias com included_in_base = false),
 * ignorando taxas que o usuário marcou como desnecessárias.
 */

import { roundHalfUpDiv } from "@/lib/money";

import type { EffectiveCostResult, MissingField, QuoteFee, SupplierQuote, UserAssets } from "./types";

export const BPS_DENOMINATOR = 10_000;

/** Aplica basis points com half-up via inteiros: applyBps(12345, 1000) → 1235. */
export function applyBps(cents: number, bps: number): number {
  if (!Number.isInteger(cents) || !Number.isInteger(bps)) {
    throw new Error("applyBps exige inteiros (centavos e bps)");
  }
  return roundHalfUpDiv(cents * bps, BPS_DENOMINATOR);
}

function assertCents(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} deve ser inteiro não-negativo em centavos`);
  }
}

/** Valor base: explícito; ou total quando não há taxas (nada a separar). Nunca estima. */
export function resolveBaseCents(quote: SupplierQuote): number | null {
  if (quote.basePriceCents !== null) {
    return quote.basePriceCents;
  }
  if (quote.fees.length === 0 && quote.totalPriceCents !== null) {
    return quote.totalPriceCents;
  }
  return null;
}

function feeAmountCents(fee: QuoteFee, baseCents: number): number | null {
  if (fee.amountCents !== null) {
    assertCents(fee.amountCents, "fee.amountCents");
    return fee.amountCents;
  }
  if (fee.rateBps !== undefined && fee.rateBps !== null) {
    return applyBps(baseCents, fee.rateBps);
  }
  return null;
}

/** V_pessoa (custo por convidado) da proposta; 0 quando a proposta não precifica por cabeça. */
export function resolvePerGuestCents(quote: SupplierQuote): number {
  if (quote.perGuestCents === undefined || quote.perGuestCents === null) {
    return 0;
  }
  assertCents(quote.perGuestCents, "perGuestCents");
  return quote.perGuestCents;
}

/**
 * C_total = V_base + V_pessoa·N + T_extra (centavos inteiros, determinístico).
 *
 * `guestCount` é o N do evento. Mantido com default 0 para não quebrar quem
 * ainda não passa o número de convidados: com 0, o resultado é idêntico ao
 * comportamento anterior (base + taxas obrigatórias).
 */
export function effectiveCost(
  quote: SupplierQuote,
  assets: UserAssets,
  guestCount = 0,
): EffectiveCostResult {
  if (!Number.isInteger(guestCount) || guestCount < 0) {
    throw new Error("guestCount deve ser inteiro não-negativo");
  }

  const baseCents = resolveBaseCents(quote);
  if (baseCents === null) {
    return { ok: false, missing: ["base_price_cents"] };
  }
  assertCents(baseCents, "basePriceCents");

  const perGuestSubtotalCents = resolvePerGuestCents(quote) * guestCount;

  const unneeded = new Set(assets.unneededFeeCategories);
  const missing: MissingField[] = [];
  let hiddenFeesCents = 0;
  let ignoredFeesCents = 0;

  for (const fee of quote.fees) {
    if (fee.includedInBase) {
      continue;
    }
    const amount = feeAmountCents(fee, baseCents);
    if (unneeded.has(fee.category)) {
      ignoredFeesCents += amount ?? 0;
      continue;
    }
    if (amount === null) {
      missing.push("fee_amount");
      continue;
    }
    hiddenFeesCents += amount;
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    effectiveCents: baseCents + perGuestSubtotalCents + hiddenFeesCents,
    baseCents,
    hiddenFeesCents,
    ignoredFeesCents,
  };
}
