import { describe, expect, it } from "vitest";

import { defaultAnswers, requiredCategories, resolveRequirements } from "@/lib/catalog/rules";
import { composeWithCoverage, type OfferRow } from "@/lib/quotes/coverage";

function supplierOffer(
  id: string,
  category: string,
  amountCents: number,
  supplier: Partial<OfferRow> = {},
): OfferRow {
  return {
    id,
    category,
    vendor_name: `Forn ${id}`,
    amount_cents: amountCents,
    fees_cents: 0,
    confidence: 0.9,
    extraction: {},
    ...supplier,
  };
}

describe("integração: entrevista → cobertura com taxonomia", () => {
  it("casamento com banda e bar: DJ não substitui banda e o bar cobre barman", () => {
    const answers = {
      ...defaultAnswers("casamento"),
      musica: "ambos",
      bebida_alcoolica: true,
      bar_terceirizado: true,
    };
    const wanted = requiredCategories(resolveRequirements("casamento", 100, answers));
    expect(wanted).toContain("banda");
    expect(wanted).toContain("som_dj");
    expect(wanted).toContain("barman");

    const result = composeWithCoverage(
      wanted,
      [
        supplierOffer("dj", "som_dj", 300_000),
        supplierOffer("bar", "bebidas", 400_000, {
          supplier_inclui: ["bebidas", "barman"],
        }),
      ],
      (c) => c,
      100,
    );
    expect(result.uncovered).toContain("banda");
    expect(result.uncovered).not.toContain("barman");
    expect(result.gaps.some((g) => /banda/.test(g.message))).toBe(true);
  });

  it("espaço pequeno para o número de convidados aparece nas lacunas", () => {
    const wanted = requiredCategories(
      resolveRequirements("festa_infantil", 120, {
        ...defaultAnswers("festa_infantil"),
        local_proprio: false,
      }),
    );
    const result = composeWithCoverage(
      wanted,
      [supplierOffer("esp", "espaco", 500_000, { supplier_capacidade: 80 })],
      (c) => c,
      120,
    );
    expect(result.gaps.map((g) => g.message).join(" ")).toContain(
      "comporta até 80 convidados; o evento tem 120",
    );
  });
});
