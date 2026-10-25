import { roundHalfUpDiv } from "@/lib/money";
import { PRICING_ASSUMPTIONS } from "@/lib/pricing";

/**
 * Regras puras de cupom (ver .context/COMMERCIAL_MODEL.md §2.4).
 * O desconto é SEMPRE calculado no servidor — o client só envia o código.
 */

/**
 * `free` = cortesia (gratuidade): total 0, sem Asaas. Só admins criam; é a
 * ÚNICA exceção ao piso de R$ 9 (resgate atômico em `redeem_courtesy_coupon`).
 */
export type CouponDiscountType = "percent" | "fixed_cents" | "free";

export interface CouponLike {
  code: string;
  discount_type: CouponDiscountType;
  value: number;
  active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  redemptions: number;
}

/** Percentual máximo permitido (evita tíquete de graça via percentual). */
const MAX_PERCENT = 90;

/**
 * Regra de ouro (spec): o valor final com cupom NUNCA fica abaixo do custo
 * operacional por evento (R$ 9 — PRICING_ASSUMPTIONS.costPerEventCents).
 * Piso técnico adicional de R$ 1,00 para a API do Asaas (cobrança > 0).
 */
const MIN_FINAL_CENTS = Math.max(PRICING_ASSUMPTIONS.costPerEventCents, 100);

export function isCouponRedeemable(coupon: CouponLike, now: Date = new Date()): boolean {
  if (!coupon.active) {
    return false;
  }
  if (coupon.expires_at !== null && new Date(coupon.expires_at).getTime() <= now.getTime()) {
    return false;
  }
  if (coupon.max_redemptions !== null && coupon.redemptions >= coupon.max_redemptions) {
    return false;
  }
  return true;
}

export function discountCents(coupon: CouponLike, priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error("priceCents deve ser inteiro positivo");
  }

  if (coupon.discount_type === "free") {
    return priceCents;
  }

  let discount: number;

  if (coupon.discount_type === "percent") {
    const percent = Math.min(coupon.value, MAX_PERCENT);
    discount = roundHalfUpDiv(priceCents * percent, 100);
  } else {
    discount = Math.min(coupon.value, priceCents);
  }

  // Nunca zerar a cobrança: garante preço final mínimo.
  return Math.min(discount, priceCents - MIN_FINAL_CENTS);
}

export function isCourtesyCoupon(coupon: Pick<CouponLike, "discount_type">): boolean {
  return coupon.discount_type === "free";
}

export function finalPriceCents(priceCents: number, discount: number): number {
  if (discount < 0 || discount > priceCents) {
    throw new Error("desconto inválido");
  }
  return priceCents - discount;
}

/** Normaliza o código digitado (maiúsculas, sem espaços). */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
