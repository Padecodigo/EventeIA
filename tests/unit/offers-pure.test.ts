import { describe, expect, it } from "vitest";

import {
  OFFER_MIN_FINAL_CENTS,
  offerDiscountCents,
  offerHeadline,
  PERSONAL_AVULSO_OFF_CENTS,
  PERSONAL_PACK_PERCENT,
  pickBetterDiscount,
  WELCOME_AVULSO_OFF_CENTS,
  WELCOME_PACK_PERCENT,
  WELCOME_PERCENT,
} from "@/lib/offers/pure";
import { formatCountdownDays } from "@/lib/welcome/format";

const welcome = { avulsoOffCents: WELCOME_AVULSO_OFF_CENTS, packPercent: WELCOME_PACK_PERCENT };
const personal = { avulsoOffCents: PERSONAL_AVULSO_OFF_CENTS, packPercent: PERSONAL_PACK_PERCENT };

describe("ofertas pessoais — valores do produto", () => {
  it("boas-vindas: 20% no avulso e em pacotes; pessoal legado: R$ 20 e 20%", () => {
    expect(WELCOME_PERCENT).toBe(20);
    expect(WELCOME_AVULSO_OFF_CENTS).toBe(1940);
    expect(WELCOME_PACK_PERCENT).toBe(20);
    expect(PERSONAL_AVULSO_OFF_CENTS).toBe(2000);
    expect(PERSONAL_PACK_PERCENT).toBe(20);
  });

  it("avulso R$ 97 ⇒ R$ 77,60 (boas-vindas e pessoal, ambos limitados a 20%)", () => {
    expect(9700 - offerDiscountCents(welcome, "avulso", 9700)).toBe(7760);
    expect(9700 - offerDiscountCents(personal, "avulso", 9700)).toBe(7760);
  });

  it("avulso nunca passa de 20% — protege ofertas antigas gravadas com R$ 40", () => {
    const legacy = { avulsoOffCents: 4000, packPercent: WELCOME_PACK_PERCENT };
    expect(offerDiscountCents(legacy, "avulso", 9700)).toBe(1940);
    expect(9700 - offerDiscountCents(legacy, "avulso", 9700)).toBe(7760);
  });

  it("pacotes: 20% com arredondamento half-up", () => {
    expect(offerDiscountCents(welcome, "pack", 19_700)).toBe(3940);
    expect(offerDiscountCents(personal, "pack", 11_700)).toBe(2340);
    expect(offerDiscountCents(welcome, "pack", 45_000)).toBe(9000);
  });

  it("piso de R$ 47 sempre respeitado", () => {
    expect(OFFER_MIN_FINAL_CENTS).toBe(4700);
    expect(5000 - offerDiscountCents(welcome, "avulso", 5000)).toBe(4700);
    expect(offerDiscountCents(welcome, "avulso", 4500)).toBe(0);
    expect(5000 - offerDiscountCents(welcome, "pack", 5000)).toBe(4700);
  });

  it("rejeita preço inválido", () => {
    expect(() => offerDiscountCents(welcome, "pack", 0)).toThrow();
    expect(() => offerDiscountCents(welcome, "pack", 10.5)).toThrow();
  });
});

describe("sem acumular: vale o maior", () => {
  it("oferta maior vence; cupom maior vence; empate fica com o cupom", () => {
    expect(pickBetterDiscount(970, 4000)).toBe("offer");
    expect(pickBetterDiscount(8730, 4000)).toBe("coupon");
    expect(pickBetterDiscount(4000, 4000)).toBe("coupon");
    expect(pickBetterDiscount(null, 4000)).toBe("offer");
    expect(pickBetterDiscount(null, null)).toBeNull();
    expect(pickBetterDiscount(0, 0)).toBeNull();
  });
});

describe("contagem dd:hh:mm:ss e texto honesto", () => {
  it("formata dias/horas/minutos/segundos sem negativo", () => {
    expect(formatCountdownDays(48 * 3600_000)).toBe("02:00:00:00");
    expect(formatCountdownDays((47 * 3600 + 12 * 60 + 5) * 1000)).toBe("01:23:12:05");
    expect(formatCountdownDays(-5)).toBe("00:00:00:00");
  });
  it("headline cita apenas o benefício real", () => {
    expect(offerHeadline()).toBe("20% de desconto nas primeiras 48h após o primeiro acesso.");
    expect(offerHeadline()).not.toMatch(/últim|corra|só hoje|cupom/i);
  });
});
