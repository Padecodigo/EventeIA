import { describe, expect, it } from "vitest";

import { discountCents, MIN_FINAL_CENTS } from "@/lib/coupons/pure";
import { OFFER_MIN_FINAL_CENTS, offerDiscountCents, WELCOME_AVULSO_OFF_CENTS, WELCOME_PACK_PERCENT, PERSONAL_AVULSO_OFF_CENTS, PERSONAL_PACK_PERCENT } from "@/lib/offers/pure";
import { PLANS } from "@/lib/plans";
import { DISCOUNT_FLOOR_CENTS, PRICING_ASSUMPTIONS } from "@/lib/pricing";

const welcome = { avulsoOffCents: WELCOME_AVULSO_OFF_CENTS, packPercent: WELCOME_PACK_PERCENT };
const personal = { avulsoOffCents: PERSONAL_AVULSO_OFF_CENTS, packPercent: PERSONAL_PACK_PERCENT };

describe("piso de desconto único (R$ 47)", () => {
  it("cupons e ofertas usam a mesma constante; custo de planejamento segue R$ 9", () => {
    expect(DISCOUNT_FLOOR_CENTS).toBe(4700);
    expect(MIN_FINAL_CENTS).toBe(DISCOUNT_FLOOR_CENTS);
    expect(OFFER_MIN_FINAL_CENTS).toBe(DISCOUNT_FLOOR_CENTS);
    expect(PRICING_ASSUMPTIONS.costPerEventCents).toBe(900);
  });
  it("avulso R$ 97 inalterado: boas-vindas R$ 57, pessoal R$ 77", () => {
    expect(9700 - offerDiscountCents(welcome, "avulso", 9700)).toBe(5700);
    expect(9700 - offerDiscountCents(personal, "avulso", 9700)).toBe(7700);
  });
  it("desconto que furaria o piso para exatamente em R$ 47", () => {
    expect(8000 - offerDiscountCents(welcome, "avulso", 8000)).toBe(4700);
    expect(9700 - discountCents({ code: "X", active: true, expires_at: null, max_redemptions: null, redemptions: 0, discount_type: "fixed_cents", value: 6000 }, 9700)).toBe(4700);
  });
  it("regressão: planos atuais com oferta não esbarram no piso", () => {
    for (const p of PLANS) {
      expect(p.priceCents - offerDiscountCents(welcome, "pack", p.priceCents)).toBeGreaterThan(DISCOUNT_FLOOR_CENTS);
    }
  });
});
