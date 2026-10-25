import { describe, expect, it } from "vitest";

import {
  CUSTOM_CREDITS_ANCHORS,
  customCreditsPriceCents,
  customCreditsTable,
  isValidCustomCredits,
  quoteCustomCredits,
} from "@/lib/credit-slider";
import { CREDIT_PACKAGES } from "@/lib/plans";
import { calculatePlanEconomics, isPlanViable } from "@/lib/pricing";

const EXPECTED_REAIS: Record<number, number> = {
  3: 117,
  4: 137,
  5: 157,
  6: 177,
  7: 197,
  8: 217,
  9: 237,
  10: 257,
  11: 277,
  12: 297,
  13: 317,
  14: 337,
  15: 357,
  16: 377,
  17: 397,
  18: 415,
  19: 432,
  20: 450,
};

describe("pacote sob medida (slider 3..20)", () => {
  it("tabela completa 3..20", () => {
    const table = customCreditsTable();
    expect(table).toHaveLength(18);
    for (const row of table) expect(row.priceCents).toBe(EXPECTED_REAIS[row.credits]! * 100);
  });

  it("âncoras exatas", () => {
    for (const [n, reais] of CUSTOM_CREDITS_ANCHORS)
      expect(customCreditsPriceCents(n)).toBe(reais * 100);
  });

  it("total estritamente crescente e preço por evento não crescente", () => {
    const t = customCreditsTable();
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.priceCents).toBeGreaterThan(t[i - 1]!.priceCents);
      expect(t[i]!.priceCents * t[i - 1]!.credits).toBeLessThanOrEqual(
        t[i - 1]!.priceCents * t[i]!.credits,
      );
    }
  });

  it("valores em reais cheios e economia vs. R$ 97", () => {
    for (const q of customCreditsTable()) {
      expect(q.priceCents % 100).toBe(0);
      expect(q.savingsCents).toBe(9_700 * q.credits - q.priceCents);
      expect(q.savingsCents).toBeGreaterThan(0);
    }
    expect(quoteCustomCredits(20).perEventCents).toBe(2_250);
  });

  it("mantém o piso de margem em Pix e cartão", () => {
    for (const q of customCreditsTable())
      for (const method of ["pix", "card"] as const)
        expect(isPlanViable(calculatePlanEconomics(q.priceCents, q.credits, method))).toBe(true);
  });

  it("rejeita quantidades inválidas", () => {
    for (const bad of [2, 21, 0, -3, 3.5, Number.NaN]) {
      expect(isValidCustomCredits(bad)).toBe(false);
      expect(() => customCreditsPriceCents(bad)).toThrow();
    }
  });

  it("regressão: pacotes fixos batem com o slider", () => {
    for (const pack of CREDIT_PACKAGES)
      expect(customCreditsPriceCents(pack.credits)).toBe(pack.priceCents);
  });
});
