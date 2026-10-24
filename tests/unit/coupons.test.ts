import { describe, expect, it } from "vitest";

import {
  discountCents,
  finalPriceCents,
  isCouponRedeemable,
  normalizeCouponCode,
  type CouponLike,
} from "@/lib/coupons/pure";

const B2C_TICKET_CENTS = 9700;

function coupon(overrides: Partial<CouponLike> = {}): CouponLike {
  return {
    code: "BEMVINDA10",
    discount_type: "percent",
    value: 10,
    active: true,
    expires_at: null,
    max_redemptions: null,
    redemptions: 0,
    ...overrides,
  };
}

describe("validação do cupom", () => {
  const now = new Date("2026-10-23T12:00:00Z");

  it("aceita cupom ativo, sem expiração e sem limite", () => {
    expect(isCouponRedeemable(coupon(), now)).toBe(true);
  });

  it("recusa inativo, expirado e esgotado", () => {
    expect(isCouponRedeemable(coupon({ active: false }), now)).toBe(false);
    expect(
      isCouponRedeemable(coupon({ expires_at: "2026-10-22T12:00:00Z" }), now),
    ).toBe(false);
    expect(
      isCouponRedeemable(coupon({ max_redemptions: 100, redemptions: 100 }), now),
    ).toBe(false);
  });

  it("expiração futura e limite não atingido são válidos", () => {
    expect(isCouponRedeemable(coupon({ expires_at: "2026-11-01T12:00:00Z" }), now)).toBe(true);
    expect(isCouponRedeemable(coupon({ max_redemptions: 100, redemptions: 99 }), now)).toBe(true);
  });
});

describe("cálculo do desconto", () => {
  it("percentual: 10% de R$ 97 = R$ 9,70 (final R$ 87,30)", () => {
    const discount = discountCents(coupon(), B2C_TICKET_CENTS);
    expect(discount).toBe(970);
    expect(finalPriceCents(B2C_TICKET_CENTS, discount)).toBe(8730);
  });

  it("percentual arredonda half-up sem float", () => {
    // 15% de 9733 = 1459,95 → 1460
    expect(discountCents(coupon({ value: 15 }), 9733)).toBe(1460);
  });

  it("percentual é limitado a 90% (final nunca menor que R$ 9,70 no tíquete)", () => {
    expect(discountCents(coupon({ value: 100 }), B2C_TICKET_CENTS)).toBe(8730);
    expect(finalPriceCents(B2C_TICKET_CENTS, 8730)).toBe(970);
  });

  it("valor fixo em centavos, limitado ao preço", () => {
    expect(
      discountCents(coupon({ discount_type: "fixed_cents", value: 2000 }), B2C_TICKET_CENTS),
    ).toBe(2000);
    expect(
      discountCents(coupon({ discount_type: "fixed_cents", value: 99900 }), B2C_TICKET_CENTS),
    ).toBe(8800);
  });

  it("REGRA DE OURO (CI): cupom nunca derruba o tíquete abaixo do custo operacional (R$ 9)", () => {
    const aggressive = [
      coupon({ value: 100 }), // percent > 90
      coupon({ value: 90 }), // percent no limite
      coupon({ discount_type: "fixed_cents", value: 99900 }),
      coupon({ discount_type: "fixed_cents", value: 8800 }),
    ];
    for (const c of aggressive) {
      const final = finalPriceCents(B2C_TICKET_CENTS, discountCents(c, B2C_TICKET_CENTS));
      expect(final).toBeGreaterThanOrEqual(900);
    }
  });

  it("rejeita preço inválido e desconto fora do intervalo", () => {
    expect(() => discountCents(coupon(), 0)).toThrow();
    expect(() => finalPriceCents(B2C_TICKET_CENTS, -1)).toThrow();
    expect(() => finalPriceCents(B2C_TICKET_CENTS, B2C_TICKET_CENTS + 1)).toThrow();
  });
});

describe("normalização do código", () => {
  it("maiúsculas e sem espaços", () => {
    expect(normalizeCouponCode("  bemvinda10 ")).toBe("BEMVINDA10");
    expect(normalizeCouponCode("Primeira Festa")).toBe("PRIMEIRAFESTA");
  });
});
