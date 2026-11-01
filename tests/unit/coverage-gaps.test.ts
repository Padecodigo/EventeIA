import { describe, expect, it } from "vitest";

import { eventCoverageGaps, parseCoverageSummary, type EventCoverageRow } from "@/lib/prospecting/coverage-gaps";

const row = (o: Partial<EventCoverageRow>): EventCoverageRow => ({
  quoteLabel: "Cotação 1",
  category: "buffet",
  itemCode: "garcons",
  coverage: "unknown",
  extraPriceCents: null,
  roundsAsked: 0,
  aConfirmar: false,
  ...o,
});

describe("eventCoverageGaps", () => {
  it("item excluído em todas as cotações vira categoria a prospectar", () => {
    const gaps = eventCoverageGaps(["buffet"], [
      row({ coverage: "excluded" }),
      row({ quoteLabel: "Cotação 2", coverage: "unknown", roundsAsked: 2, aConfirmar: true }),
    ]);
    expect(gaps).toContainEqual({ item: "garcons", fromCategory: "buffet", needCategory: "garcons" });
  });

  it("regressão: item ainda em negociação não dispara prospecção antecipada", () => {
    expect(eventCoverageGaps(["buffet"], [row({ coverage: "unknown", roundsAsked: 1 })])).toEqual([]);
    expect(
      eventCoverageGaps(["buffet"], [row({ coverage: "excluded" }), row({ quoteLabel: "Cotação 2", roundsAsked: 0 })]),
    ).toEqual([]);
  });

  it("uma cotação que inclui (ou extra com preço) fecha a lacuna", () => {
    expect(eventCoverageGaps(["buffet"], [row({ coverage: "excluded" }), row({ quoteLabel: "Cotação 2", coverage: "included" })])).toEqual([]);
    expect(eventCoverageGaps(["buffet"], [row({ coverage: "optional_extra", extraPriceCents: 5000 })])).toEqual([]);
  });

  it("não duplica categoria já selecionada nem sem categoria/cotações", () => {
    expect(eventCoverageGaps(["buffet", "garcons"], [row({ coverage: "excluded" })])).toEqual([]);
    expect(eventCoverageGaps(["buffet"], [row({ category: null, coverage: "excluded" })])).toEqual([]);
    expect(eventCoverageGaps(["buffet"], [])).toEqual([]);
  });
});

describe("parseCoverageSummary", () => {
  it("lê linhas da RPC e ignora lixo", () => {
    expect(
      parseCoverageSummary([
        { quote_label: "Cotação 1", category: "buffet", item_code: "limpeza", coverage: "weird", extra_price_cents: "100", rounds_asked: 2, a_confirmar: true },
        { nope: 1 },
      ]),
    ).toEqual([row({ itemCode: "limpeza", extraPriceCents: 100, roundsAsked: 2, aConfirmar: true })]);
    expect(parseCoverageSummary(null)).toEqual([]);
  });
});
