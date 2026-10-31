import { roundHalfUpDiv } from "./money";

/**
 * Economia unitária dos planos (ver .context/COMMERCIAL_MODEL.md §3.4).
 *
 * Premissas conservadoras (Out/2026), em basis points (1 bp = 0,01%):
 * - custo direto por evento ativado: R$ 9,00 (infra + IA + suporte)
 * - Simples Nacional (Anexo III/ME): 600 bp (6% sobre o faturamento)
 * - Asaas Pix: R$ 1,99 por cobrança; cartão: 299 bp (2,99%) + R$ 0,49
 * - margem de contribuição mínima aceitável: 3.500 bp (35% por crédito)
 *
 * Regra de ouro: NENHUM plano pode vender crédito abaixo do custo. O teste
 * `tests/unit/pricing.test.ts` falha o CI se algum plano furar o piso.
 */
export type PaymentMethod = "pix" | "card";

export interface PricingAssumptions {
  costPerEventCents: number;
  taxRateBps: number;
  pixFeeCents: number;
  cardRateBps: number;
  cardFixedCents: number;
  minMarginBps: number;
}

/**
 * Piso de desconto: nenhum cupom/oferta deixa o valor final abaixo disto
 * (decisão de produto 25/10/2026). Desacoplado de `costPerEventCents`
 * (premissa de custo, usada só no planejamento). Cortesia (free) é a única exceção.
 */
export const DISCOUNT_FLOOR_CENTS = 4_700;

export const PRICING_ASSUMPTIONS: PricingAssumptions = {
  costPerEventCents: 900,
  taxRateBps: 600, // 6%
  pixFeeCents: 199,
  cardRateBps: 299, // 2,99%
  cardFixedCents: 49,
  minMarginBps: 3_500, // 35%
};

/** Aplica basis points com arredondamento half-up. */
function applyBps(valueCents: number, bps: number): number {
  return roundHalfUpDiv(valueCents * bps, 10_000);
}

export interface PlanEconomics {
  revenuePerCreditCents: number;
  taxPerCreditCents: number;
  feePerCreditCents: number;
  costPerEventCents: number;
  contributionPerCreditCents: number;
  marginBps: number;
}

export function calculatePlanEconomics(
  priceCents: number,
  credits: number,
  method: PaymentMethod,
  assumptions: PricingAssumptions = PRICING_ASSUMPTIONS,
): PlanEconomics {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error("priceCents deve ser inteiro positivo");
  }
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("credits deve ser inteiro positivo");
  }

  const revenuePerCreditCents = roundHalfUpDiv(priceCents, credits);
  const taxPerCreditCents = applyBps(revenuePerCreditCents, assumptions.taxRateBps);

  const totalFeeCents =
    method === "pix"
      ? assumptions.pixFeeCents
      : applyBps(priceCents, assumptions.cardRateBps) + assumptions.cardFixedCents;

  const feePerCreditCents = roundHalfUpDiv(totalFeeCents, credits);
  const contributionPerCreditCents =
    revenuePerCreditCents -
    taxPerCreditCents -
    feePerCreditCents -
    assumptions.costPerEventCents;

  const marginBps =
    revenuePerCreditCents === 0
      ? 0
      : roundHalfUpDiv(contributionPerCreditCents * 10_000, revenuePerCreditCents);

  return {
    revenuePerCreditCents,
    taxPerCreditCents,
    feePerCreditCents,
    costPerEventCents: assumptions.costPerEventCents,
    contributionPerCreditCents,
    marginBps,
  };
}

export function isPlanViable(
  economics: PlanEconomics,
  assumptions: PricingAssumptions = PRICING_ASSUMPTIONS,
): boolean {
  return (
    economics.contributionPerCreditCents > 0 && economics.marginBps >= assumptions.minMarginBps
  );
}

/** Percentual legível (ex.: 4557 bp → "45,6%"). */
export function formatMarginBps(marginBps: number): string {
  return `${(marginBps / 100).toFixed(1).replace(".", ",")}%`;
}
