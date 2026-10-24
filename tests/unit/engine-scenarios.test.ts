import { describe, expect, it } from "vitest";

import { applyBps, effectiveCost } from "@/lib/engine/calculator";
import { buildAllScenarios, buildScenario, valueScoreCents } from "@/lib/engine/scenarios";
import type { SupplierQuote, UserAssets } from "@/lib/engine/types";

const noAssets: UserAssets = { alreadyOwned: [], unneededFeeCategories: [] };

function quote(partial: Partial<SupplierQuote> & { supplierId: string; covers: string[] }): SupplierQuote {
  return {
    supplierName: partial.supplierId,
    basePriceCents: 100_000,
    totalPriceCents: null,
    fees: [],
    qualityBps: 8_000,
    ...partial,
  };
}

describe("applyBps — arredondamento half-up inteiro", () => {
  it("arredonda meio centavo para cima", () => {
    expect(applyBps(12_345, 1_000)).toBe(1_235); // 1234,5 → 1235
    expect(applyBps(12_344, 1_000)).toBe(1_234); // 1234,4 → 1234
    expect(applyBps(1, 5_000)).toBe(1); // 0,5 → 1
  });
  it("rejeita valores fracionários", () => {
    expect(() => applyBps(10.5, 100)).toThrow();
  });
});

describe("effectiveCost — taxas ocultas e deduções", () => {
  it("soma apenas taxas fora do base", () => {
    const result = effectiveCost(
      quote({
        supplierId: "a",
        covers: ["buffet"],
        fees: [
          { category: "cleaning", description: "limpeza", amountCents: 15_000, includedInBase: false },
          { category: "service_staff", description: "garçons", amountCents: 20_000, includedInBase: true },
          { category: "service_staff", description: "10% serviço", amountCents: null, rateBps: 1_000, includedInBase: false },
        ],
      }),
      noAssets,
    );
    expect(result).toEqual({
      ok: true,
      effectiveCents: 125_000,
      baseCents: 100_000,
      hiddenFeesCents: 25_000,
      ignoredFeesCents: 0,
    });
  });

  it("ignora categoria de taxa marcada como desnecessária", () => {
    const result = effectiveCost(
      quote({
        supplierId: "a",
        covers: ["buffet"],
        fees: [{ category: "dishes_and_cutlery", description: "louça", amountCents: 8_000, includedInBase: false }],
      }),
      { alreadyOwned: [], unneededFeeCategories: ["dishes_and_cutlery"] },
    );
    expect(result.ok && result.effectiveCents).toBe(100_000);
    expect(result.ok && result.ignoredFeesCents).toBe(8_000);
  });

  it("sem base e com taxas ⇒ dado faltante (não estima)", () => {
    const result = effectiveCost(
      quote({
        supplierId: "a",
        covers: ["buffet"],
        basePriceCents: null,
        totalPriceCents: 90_000,
        fees: [{ category: "other", description: "x", amountCents: 1_000, includedInBase: false }],
      }),
      noAssets,
    );
    expect(result).toEqual({ ok: false, missing: ["base_price_cents"] });
  });

  it("usa total como base quando não há taxas", () => {
    const result = effectiveCost(
      quote({ supplierId: "a", covers: ["buffet"], basePriceCents: null, totalPriceCents: 90_000 }),
      noAssets,
    );
    expect(result.ok && result.effectiveCents).toBe(90_000);
  });

  it("taxa sem valor nem percentual ⇒ faltante", () => {
    const result = effectiveCost(
      quote({
        supplierId: "a",
        covers: ["buffet"],
        fees: [{ category: "delivery_pickup", description: "frete", amountCents: null, includedInBase: false }],
      }),
      noAssets,
    );
    expect(result).toEqual({ ok: false, missing: ["fee_amount"] });
  });
});

describe("cenários", () => {
  const quotes: SupplierQuote[] = [
    quote({ supplierId: "buffet-barato", covers: ["buffet"], basePriceCents: 200_000, qualityBps: 5_000 }),
    quote({ supplierId: "buffet-bom", covers: ["buffet"], basePriceCents: 230_000, qualityBps: 10_000 }),
    quote({ supplierId: "decor", covers: ["decoracao"], basePriceCents: 80_000, qualityBps: 9_000 }),
    quote({ supplierId: "pacote", covers: ["buffet", "decoracao"], basePriceCents: 320_000, qualityBps: 9_000 }),
  ];
  const required = ["buffet", "decoracao"];

  it("Preço escolhe o menor total", () => {
    const { scenario } = buildScenario("preco", required, quotes, noAssets);
    expect(scenario?.totalCents).toBe(280_000);
    expect(scenario?.selections.map((s) => s.supplierId).sort()).toEqual(["buffet-barato", "decor"]);
  });

  it("Custo-Benefício usa score determinístico", () => {
    expect(valueScoreCents(200_000, 5_000)).toBe(300_000);
    const { scenario } = buildScenario("custo_beneficio", required, quotes, noAssets);
    expect(scenario?.selections.map((s) => s.supplierId).sort()).toEqual(["buffet-bom", "decor"]);
    expect(scenario?.scoreCents).toBe(230_000 + 88_000);
  });

  it("Comodidade minimiza fornecedores", () => {
    const { scenario } = buildScenario("comodidade", required, quotes, noAssets);
    expect(scenario?.supplierCount).toBe(1);
    expect(scenario?.selections[0]?.supplierId).toBe("pacote");
  });

  it("item já possuído custa 0 (categoria sai da exigência)", () => {
    const { scenario } = buildScenario("preco", required, quotes, {
      alreadyOwned: ["decoracao"],
      unneededFeeCategories: [],
    });
    expect(scenario?.totalCents).toBe(200_000);
    expect(scenario?.ownedCategories).toEqual(["decoracao"]);
  });

  it("dados insuficientes ⇒ null + faltantes", () => {
    const outcomes = buildAllScenarios(["buffet", "fotografia"], quotes, noAssets);
    expect(outcomes.preco.scenario).toBeNull();
    expect(outcomes.preco.missing).toContainEqual({ category: "fotografia", supplierId: null, field: "quote" });
  });

  it("custo-benefício sem qualidade ⇒ null, não estima", () => {
    const outcome = buildScenario(
      "custo_beneficio",
      ["buffet"],
      [quote({ supplierId: "x", covers: ["buffet"], qualityBps: null })],
      noAssets,
    );
    expect(outcome.scenario).toBeNull();
    expect(outcome.missing[0]?.field).toBe("quality_bps");
  });

  it("é determinístico (mesma entrada ⇒ mesma saída, independente da ordem)", () => {
    const a = buildAllScenarios(required, quotes, noAssets);
    const b = buildAllScenarios(required, [...quotes].reverse(), noAssets);
    expect(a).toEqual(b);
  });
});
