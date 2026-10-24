import { describe, expect, it } from "vitest";

import { CREDIT_PACKAGES, PLANS } from "@/lib/plans";
import {
  calculatePlanEconomics,
  formatMarginBps,
  isPlanViable,
  PRICING_ASSUMPTIONS,
} from "@/lib/pricing";

const B2C_TICKET_CENTS = 9_700;

describe("economia unitária dos planos B2B", () => {
  it("todos os planos vendem crédito acima do custo (Pix e cartão)", () => {
    for (const plan of PLANS) {
      for (const method of ["pix", "card"] as const) {
        const economics = calculatePlanEconomics(plan.priceCents, plan.credits, method);
        expect(economics.contributionPerCreditCents).toBeGreaterThan(0);
      }
    }
  });

  it("todos os planos respeitam o piso de margem de 35% (Pix)", () => {
    for (const plan of PLANS) {
      const economics = calculatePlanEconomics(plan.priceCents, plan.credits, "pix");
      expect(isPlanViable(economics)).toBe(true);
      expect(economics.marginBps).toBeGreaterThanOrEqual(PRICING_ASSUMPTIONS.minMarginBps);
    }
  });

  it("todos os planos respeitam o piso de margem de 35% (cartão)", () => {
    for (const plan of PLANS) {
      const economics = calculatePlanEconomics(plan.priceCents, plan.credits, "card");
      expect(isPlanViable(economics)).toBe(true);
    }
  });

  it("o plano de entrada não repete o prejuízo do modelo antigo (10 créditos por R$ 97)", () => {
    const oldEntry = calculatePlanEconomics(9_700, 10, "pix");
    expect(isPlanViable(oldEntry)).toBe(false);

    const currentEntry = PLANS[0];
    expect(currentEntry).toBeDefined();
    if (currentEntry !== undefined) {
      const economics = calculatePlanEconomics(currentEntry.priceCents, currentEntry.credits, "pix");
      expect(isPlanViable(economics)).toBe(true);
    }
  });
});

describe("pacotes de créditos avulsos", () => {
  it("mantêm o piso de 35% em Pix e cartão", () => {
    for (const pack of CREDIT_PACKAGES) {
      for (const method of ["pix", "card"] as const) {
        const economics = calculatePlanEconomics(pack.priceCents, pack.credits, method);
        expect(isPlanViable(economics)).toBe(true);
      }
    }
  });
});

describe("tíquete B2C", () => {
  it("é viável com R$ 97 por evento (Pix e cartão)", () => {
    for (const method of ["pix", "card"] as const) {
      const economics = calculatePlanEconomics(B2C_TICKET_CENTS, 1, method);
      expect(isPlanViable(economics)).toBe(true);
      expect(economics.marginBps).toBeGreaterThanOrEqual(PRICING_ASSUMPTIONS.minMarginBps);
    }
  });
});

describe("apresentação", () => {
  it("formata margem em basis points como percentual pt-BR", () => {
    expect(formatMarginBps(4_557)).toBe("45,6%");
    expect(formatMarginBps(3_500)).toBe("35,0%");
  });

  it("rejeita entradas inválidas", () => {
    expect(() => calculatePlanEconomics(0, 5, "pix")).toThrow();
    expect(() => calculatePlanEconomics(9_700, 0, "pix")).toThrow();
  });
});
