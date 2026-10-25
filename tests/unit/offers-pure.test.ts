import { describe, expect, it } from "vitest";

import {
  OFFER_MIN_FINAL_CENTS,
  offerDiscountCents,
  offerHeadline,
  PERSONAL_AVULSO_OFF_CENTS,
  PERSONAL_COUPON_COOLDOWN_DAYS,
  PERSONAL_PACK_PERCENT,
  pickBetterDiscount,
  WELCOME_AVULSO_OFF_CENTS,
  WELCOME_PACK_PERCENT,
} from "@/lib/offers/pure";
import { formatCountdownDays } from "@/lib/welcome/format";

const welcome = { avulsoOffCents: WELCOME_AVULSO_OFF_CENTS, packPercent: WELCOME_PACK_PERCENT };
const personal = { avulsoOffCents: PERSONAL_AVULSO_OFF_CENTS, packPercent: PERSONAL_PACK_PERCENT };

describe("ofertas pessoais — valores do produto", () => {
  it("boas-vindas: R$ 40 no avulso e 30% em pacotes; pessoal: R$ 20 e 20%; intervalo 90 dias", () => {
    expect(WELCOME_AVULSO_OFF_CENTS).toBe(4000);
    expect(WELCOME_PACK_PERCENT).toBe(30);
    expect(PERSONAL_AVULSO_OFF_CENTS).toBe(2000);
    expect(PERSONAL_PACK_PERCENT).toBe(20);
    expect(PERSONAL_COUPON_COOLDOWN_DAYS).toBe(90);
  });

  it("avulso R$ 97 ⇒ R$ 57 (boas-vindas) e R$ 77 (pessoal)", () => {
    expect(9700 - offerDiscountCents(welcome, "avulso", 9700)).toBe(5700);
    expect(9700 - offerDiscountCents(personal, "avulso", 9700)).toBe(7700);
  });

  it("pacotes: 30% / 20% com arredondamento half-up", () => {
    expect(offerDiscountCents(welcome, "pack", 19_700)).toBe(5910);
    expect(offerDiscountCents(personal, "pack", 11_700)).toBe(2340);
    expect(offerDiscountCents(welcome, "pack", 45_000)).toBe(13_500);
  });

  it("piso de R$ 47 sempre respeitado", () => {
    expect(OFFER_MIN_FINAL_CENTS).toBe(4700);
    expect(6000 - offerDiscountCents(welcome, "avulso", 6000)).toBe(4700);
    expect(offerDiscountCents(welcome, "avulso", 4500)).toBe(0);
    expect(6000 - offerDiscountCents(welcome, "pack", 6000)).toBe(4700);
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
    expect(offerHeadline("welcome", welcome)).toBe(
      "Oferta de boas-vindas: R$ 40 de desconto no evento avulso ou 30% nos pacotes de créditos",
    );
    expect(offerHeadline("personal", personal)).toMatch(/R\$ 20 .* 20%/);
    expect(offerHeadline("welcome", welcome)).not.toMatch(/últim|corra|só hoje/i);
  });
});
