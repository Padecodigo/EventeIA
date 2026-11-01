import { describe, expect, it } from "vitest";

import { expectedCoverageItems } from "@/lib/catalog/coverage-map";
import {
  applyClassification,
  awaitingAnswer,
  buildCoverageQuestion,
  coverageGaps,
  effectiveCoverage,
  markAsked,
  needsAsking,
  parseClassification,
  seedCoverage,
} from "@/lib/prospecting/coverage-loop";

const NOW = "2026-11-03T13:00:00.000Z";

describe("mapa de cobertura", () => {
  it("buffet pede louça, garçons e limpeza; categoria desconhecida não pede nada", () => {
    expect(expectedCoverageItems("Buffet")).toEqual(expect.arrayContaining(["louca_talheres", "garcons", "limpeza"]));
    expect(expectedCoverageItems("xyz")).toEqual([]);
  });
  it("seed: tudo unknown, nada presumido incluso", () => {
    const rows = seedCoverage("buffet");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.coverage === "unknown" && r.roundsAsked === 0)).toBe(true);
  });
});

describe("parseClassification", () => {
  const allowed = ["garcons", "limpeza", "louca_talheres"] as const;
  it("valida com zod e descarta itens fora da lista", () => {
    const raw = JSON.stringify({
      items: [
        { item_code: "garcons", coverage: "included", evidence: "4 garçons inclusos", confidence: 0.95 },
        { item_code: "som", coverage: "included", evidence: "som incluso", confidence: 0.9 },
        { item_code: "limpeza", coverage: "nope" },
      ],
    });
    const out = parseClassification(raw, allowed);
    expect(out.map((c) => c.item_code)).toEqual(["garcons"]);
  });
  it("termo vago vira unknown (nunca included falso)", () => {
    const raw = JSON.stringify({ items: [{ item_code: "limpeza", coverage: "included", evidence: "limpeza a combinar", confidence: 0.9 }] });
    expect(parseClassification(raw, allowed)[0]?.coverage).toBe("unknown");
  });
  it("sem evidência não vira included", () => {
    const raw = JSON.stringify({ items: [{ item_code: "limpeza", coverage: "included", evidence: "", confidence: 0.9 }] });
    expect(parseClassification(raw, allowed)[0]?.coverage).toBe("unknown");
  });
  it("saída inválida ⇒ lista vazia", () => {
    expect(parseClassification("não sei", allowed)).toEqual([]);
  });
});

describe("rodadas", () => {
  it("máximo de 2 rodadas e depois tratado como não incluído com aviso", () => {
    let rows = seedCoverage("buffet").filter((r) => r.itemCode === "limpeza");
    rows = markAsked(rows, ["limpeza"], NOW);
    expect(needsAsking(rows[0]!)).toBe(true);
    rows = markAsked(rows, ["limpeza"], NOW);
    expect(rows[0]?.roundsAsked).toBe(2);
    expect(needsAsking(rows[0]!)).toBe(false);
    expect(effectiveCoverage(rows)[0]).toMatchObject({ included: false, aConfirmar: true });
  });
  it("aguardando resposta só depois de perguntar", () => {
    const rows = markAsked(seedCoverage("buffet"), ["garcons"], NOW);
    expect(awaitingAnswer(rows)).toEqual(["garcons"]);
    const answered = applyClassification(rows, [{ item_code: "garcons", coverage: "excluded", extra_price_cents: null, quantity: null, evidence: "não temos garçons", confidence: 0.9 }], "2026-11-03T14:00:00.000Z");
    expect(awaitingAnswer(answered)).toEqual([]);
  });
  it("contradição: vale a mais recente; unknown não apaga resposta firme", () => {
    let rows = seedCoverage("buffet");
    rows = applyClassification(rows, [{ item_code: "garcons", coverage: "included", extra_price_cents: null, quantity: 4, evidence: "4 garçons", confidence: 0.9 }], NOW);
    rows = applyClassification(rows, [{ item_code: "garcons", coverage: "optional_extra", extra_price_cents: 50000, quantity: null, evidence: "garçom é à parte R$500", confidence: 0.9 }], NOW);
    expect(rows.find((r) => r.itemCode === "garcons")).toMatchObject({ coverage: "optional_extra", extraPriceCents: 50000 });
    rows = applyClassification(rows, [{ item_code: "garcons", coverage: "unknown", extra_price_cents: null, quantity: null, evidence: "depende", confidence: 0.3 }], NOW);
    expect(rows.find((r) => r.itemCode === "garcons")?.coverage).toBe("optional_extra");
  });
});

describe("pergunta", () => {
  it("1ª rodada agrupa todos os itens numa pergunta; 2ª é fechada", () => {
    const q1 = buildCoverageQuestion(["louca_talheres", "garcons"], 1);
    expect(q1).toContain("louça e talheres?");
    expect(q1).toContain("garçons e copeiras?");
    expect(buildCoverageQuestion(["limpeza"], 2)).toMatch(/sim ou não/);
    expect(buildCoverageQuestion([], 1)).toBe("");
  });
});

describe("lacunas", () => {
  it("item sem cotação included/extra com preço é lacuna; unknown não cobre", () => {
    const a = applyClassification(seedCoverage("buffet"), [{ item_code: "garcons", coverage: "included", extra_price_cents: null, quantity: null, evidence: "garçons inclusos", confidence: 0.9 }], NOW);
    const b = applyClassification(seedCoverage("buffet"), [{ item_code: "limpeza", coverage: "optional_extra", extra_price_cents: 30000, quantity: null, evidence: "limpeza R$300 à parte", confidence: 0.9 }], NOW);
    expect(coverageGaps(["garcons", "limpeza", "louca_talheres"], [a, b])).toEqual(["louca_talheres"]);
  });
});
