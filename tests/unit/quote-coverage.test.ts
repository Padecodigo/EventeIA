import { describe, expect, it } from "vitest";

import { composeWithCoverage, expandOffer, type OfferRow } from "@/lib/quotes/coverage";
import { scenarioCsv, scenarioLines } from "@/lib/quotes/export";
import {
  buildEventScenarios,
  parseScenarioSnapshot,
  toSnapshotRows,
  type QuotationRowForScenario,
} from "@/lib/quotes/scenarios";

type Scope = { item: string; status: "inclui" | "nao_inclui"; price_cents?: number | null }[];
type Fee = { category: string; amount: number };

function offer(
  id: string,
  category: string,
  amount: number,
  scope: Scope = [],
  fees: Fee[] = [],
  confidence = 0.9,
): QuotationRowForScenario {
  return {
    id,
    category,
    vendor_name: `Forn ${id}`,
    vendor_contact: "+5512999990000",
    amount_cents: amount,
    fees_cents: fees.reduce((s, f) => s + f.amount, 0),
    confidence,
    needs_followup: false,
    extraction: {
      quotation: { scope: scope.map((s) => ({ price_cents: null, ...s })) },
      fees: fees.map((f) => ({
        category: f.category,
        description: `taxa ${f.category}`,
        amount_cents: f.amount,
        included_in_base: false,
      })),
    },
  };
}

const ids = (
  r: ReturnType<typeof composeWithCoverage>,
  k: "preco" | "custo_beneficio" | "comodidade" = "preco",
) => (r.outcomes[k].scenario?.selections ?? []).map((s) => s.supplierId.split("#")[0]).sort();

describe("redundância: nunca paga duas vezes o mesmo serviço", () => {
  it("buffet que inclui garçons dispensa a contratação de garçons à parte", () => {
    const r = composeWithCoverage(
      ["buffet", "garcons"],
      [
        offer("buf", "buffet", 1_000_000, [
          { item: "comida", status: "inclui" },
          { item: "garcons", status: "inclui" },
        ]),
        offer("gar", "garcons", 100_000),
      ],
    );
    expect(ids(r)).toEqual(["buf"]);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(1_000_000);
    for (const k of ["preco", "custo_beneficio", "comodidade"] as const)
      expect(ids(r, k)).toEqual(["buf"]);
  });

  it("espaço com limpeza inclusa dispensa equipe de limpeza", () => {
    const r = composeWithCoverage(
      ["espaco", "limpeza"],
      [
        offer("esp", "espaco", 500_000, [{ item: "limpeza", status: "inclui" }]),
        offer("lim", "limpeza", 50_000),
      ],
    );
    expect(ids(r)).toEqual(["esp"]);
  });

  it("taxa de serviço do buffet é descartada quando outro escolhido já inclui garçons, com observação", () => {
    // Espaço com garçons inclusos; buffet cobra taxa de serviço à parte (somada no total).
    const r = composeWithCoverage(
      ["espaco", "buffet", "garcons"],
      [
        offer("esp", "espaco", 600_000, [{ item: "garcons", status: "inclui" }]),
        offer("buf", "buffet", 900_000, [], [{ category: "service_staff", amount: 150_000 }]),
      ],
    );
    expect(ids(r)).toEqual(["buf", "esp"]);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(600_000 + 750_000);
    const bufSel = r.outcomes.preco.scenario?.selections.find((s) =>
      s.supplierId.startsWith("buf"),
    );
    const note = r.details.preco[bufSel?.supplierId ?? ""]?.notes.join(" ") ?? "";
    expect(note).toMatch(/dispensado: garcons já incluso em Forn esp/);
  });

  it("item não incluso com preço à parte vira adicional só quando ninguém cobre", () => {
    const rows = [
      offer("buf", "buffet", 800_000, [
        { item: "louca_talheres", status: "nao_inclui", price_cents: 60_000 },
      ]),
    ];
    const r = composeWithCoverage(["buffet", "louca"], rows);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(860_000);
    expect(r.uncovered).toEqual([]);
    const sel = r.outcomes.preco.scenario?.selections[0];
    expect(r.details.preco[sel?.supplierId ?? ""]?.notes[0]).toMatch(
      /Inclui à parte: louça e talheres/,
    );
  });

  it("adicional de louça perde para locadora mais barata, sem duplicar", () => {
    const r = composeWithCoverage(
      ["buffet", "louca"],
      [
        offer("buf", "buffet", 800_000, [
          { item: "louca_talheres", status: "nao_inclui", price_cents: 90_000 },
        ]),
        offer("loc", "louca", 40_000),
      ],
    );
    expect(ids(r)).toEqual(["buf", "loc"]);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(840_000);
  });

  it("sobreposição inevitável cai no modo flexível e avisa", () => {
    const r = composeWithCoverage(
      ["buffet", "garcons", "bebidas"],
      [
        offer("buf", "buffet", 800_000, [{ item: "garcons", status: "inclui" }]),
        offer("bar", "bebidas", 300_000, [{ item: "garcons", status: "inclui" }]),
      ],
    );
    expect(r.overlapFallback.preco).toBe(true);
    expect(
      Object.values(r.details.preco).some((d) => d.notes.some((n) => /duplicado/.test(n))),
    ).toBe(true);
  });
});

describe("lacunas", () => {
  it("necessidade sem oferta fica 'não coberto' e o restante é composto", () => {
    const r = composeWithCoverage(["buffet", "decoracao"], [offer("buf", "buffet", 500_000)]);
    expect(r.uncovered).toEqual(["decoracao"]);
    expect(ids(r)).toEqual(["buf"]);
  });
  it("lacuna preenchida pela oferta de outro fornecedor que inclui o item", () => {
    const r = composeWithCoverage(
      ["espaco", "mobiliario"],
      [offer("esp", "espaco", 500_000, [{ item: "mesas_cadeiras", status: "inclui" }])],
    );
    expect(r.uncovered).toEqual([]);
    expect(ids(r)).toEqual(["esp"]);
  });
});

describe("expandOffer", () => {
  it("ignora itens inclusos que a família não pediu", () => {
    const row: OfferRow = offer("buf", "buffet", 500_000, [{ item: "som", status: "inclui" }]);
    const { variants } = expandOffer(row, new Set(["buffet"]));
    expect(variants).toHaveLength(1);
    expect(variants[0]?.quote.covers).toEqual(["buffet"]);
  });
  it("regressão: oferta sem escopo e com taxa de limpeza não pedida mantém a taxa obrigatória", () => {
    const { variants } = expandOffer(
      offer("a", "buffet", 330_000, [], [{ category: "cleaning", amount: 30_000 }]),
      new Set(["buffet"]),
    );
    expect(variants[0]?.quote.basePriceCents).toBe(300_000);
    expect(variants[0]?.quote.fees).toHaveLength(1);
  });
});

describe("integração: snapshot → PDF/CSV mostra o que cada item inclui", () => {
  it("CSV traz inclui / não inclui / observações e linha de não coberto", () => {
    const quotes = [
      offer("buf", "buffet", 1_000_000, [
        { item: "comida", status: "inclui" },
        { item: "garcons", status: "inclui" },
        { item: "lavagem_louca", status: "nao_inclui", price_cents: 20_000 },
      ]),
      offer("gar", "garcons", 100_000),
    ];
    const reqs = [{ category: "buffet" }, { category: "garcons" }, { category: "decoracao" }];
    const result = buildEventScenarios(reqs, quotes);
    const rows = toSnapshotRows("evt", "v1", result, quotes);
    const snap = parseScenarioSnapshot(rows[0]?.breakdown);
    expect(snap).not.toBeNull();
    if (snap === null) return;
    expect(snap.contacts[Object.keys(snap.contacts)[0] ?? ""]?.name).toBe("Forn buf");
    const lines = scenarioLines(snap);
    expect(lines[0]?.includes).toEqual(["comida", "garçons e copeiras"]);
    expect(lines[0]?.excludes[0]).toMatch(/lavagem da louça \(R\$\s?200,00 à parte\)/);
    const csv = scenarioCsv(snap);
    expect(csv.split("\n")[0]).toContain("inclui;nao_inclui;observacoes");
    expect(csv).toContain("NÃO COBERTO");
    expect(csv).toContain("Decoração");
    expect(csv).not.toContain("Forn gar");
  });
  it("regressão: snapshot antigo sem 'details' continua legível", () => {
    const quotes = [offer("buf", "buffet", 500_000)];
    const rows = toSnapshotRows(
      "evt",
      "v1",
      buildEventScenarios([{ category: "buffet" }], quotes),
      quotes,
    );
    const b = { ...(rows[0]?.breakdown as object) } as Record<string, unknown>;
    delete b.details;
    const snap = parseScenarioSnapshot(b);
    expect(snap).not.toBeNull();
    expect(scenarioLines(snap!)[0]?.includes).toEqual([]);
  });
});

describe("taxonomia do fornecedor: inclui padrão, nuances e capacidade", () => {
  function supplierOffer(
    id: string,
    category: string,
    amount: number,
    opts: {
      scope?: Scope;
      inclui?: string[];
      capacidade?: number | null;
      tipoEspaco?: string | null;
      fees?: Fee[];
    } = {},
  ): OfferRow {
    return {
      ...offer(id, category, amount, opts.scope ?? [], opts.fees ?? []),
      supplier_inclui: opts.inclui,
      supplier_capacidade: opts.capacidade ?? null,
      supplier_tipo_espaco: opts.tipoEspaco ?? null,
    };
  }

  it("buffet só com comida sinaliza louça e garçons à parte", () => {
    const r = composeWithCoverage(
      ["buffet", "louca", "garcons"],
      [supplierOffer("buf", "buffet", 800_000, { inclui: ["comida"] })],
    );
    expect(r.required).toEqual(["buffet"]);
    expect(r.uncovered).toEqual(["louca", "garcons"]);
    const messages = r.gaps.map((g) => g.message).join(" ");
    expect(messages).toContain("Este buffet não inclui louça; vamos buscar à parte.");
    expect(messages).toContain("Este buffet não inclui garçons; vamos buscar à parte.");
  });

  it("buffet completo cobre comida, serviço, louça e bebidas sem lacunas", () => {
    const r = composeWithCoverage(
      ["buffet", "garcons", "louca", "bebidas"],
      [
        supplierOffer("buf", "buffet", 1_200_000, {
          inclui: ["comida", "servico", "louca", "bebidas"],
        }),
      ],
    );
    expect(r.required).toEqual(["buffet", "garcons", "louca", "bebidas"]);
    expect(r.uncovered).toEqual([]);
    expect(r.gaps).toEqual([]);
    expect(ids(r)).toEqual(["buf"]);
  });

  it("escopo explícito 'não inclui louça' vira explicação mesmo sem tags", () => {
    const r = composeWithCoverage(
      ["buffet", "louca"],
      [
        supplierOffer("buf", "buffet", 800_000, {
          scope: [{ item: "louca_talheres", status: "nao_inclui" }],
        }),
      ],
    );
    expect(r.uncovered).toEqual(["louca"]);
    expect(r.gaps[0]?.message).toBe("Este buffet não inclui louça; vamos buscar à parte.");
  });

  it("banda e DJ não se cobrem: DJ não vira banda", () => {
    const r = composeWithCoverage(["som_dj", "banda"], [offer("dj", "som_dj", 300_000)]);
    expect(r.required).toEqual(["som_dj"]);
    expect(r.uncovered).toEqual(["banda"]);
    expect(r.gaps.some((g) => /banda/.test(g.message))).toBe(true);
  });

  it("barman é coberto por tag de inclui do fornecedor de bebidas", () => {
    const r = composeWithCoverage(
      ["bebidas", "barman"],
      [supplierOffer("bar", "bebidas", 400_000, { inclui: ["bebidas", "barman"] })],
    );
    expect(r.required).toEqual(["bebidas", "barman"]);
    expect(r.uncovered).toEqual([]);
    expect(ids(r)).toEqual(["bar"]);
  });

  it("cantor de cerimônia é coberto por tag própria", () => {
    const r = composeWithCoverage(
      ["cantor_cerimonia"],
      [supplierOffer("cant", "cantor_cerimonia", 250_000, { inclui: ["cantor_cerimonia"] })],
    );
    expect(r.required).toEqual(["cantor_cerimonia"]);
    expect(r.uncovered).toEqual([]);
  });

  it("espaço menor que o número de convidados gera alerta de capacidade", () => {
    const r = composeWithCoverage(
      ["espaco"],
      [supplierOffer("esp", "espaco", 700_000, { capacidade: 80, tipoEspaco: "chacara" })],
      (c) => c,
      90,
    );
    expect(r.required).toEqual(["espaco"]);
    expect(r.gaps.map((g) => g.message).join(" ")).toContain(
      "Este espaço comporta até 80 convidados; o evento tem 90.",
    );
  });

  it("espaço com capacidade suficiente não gera alerta", () => {
    const r = composeWithCoverage(
      ["espaco"],
      [supplierOffer("esp", "espaco", 700_000, { capacidade: 120 })],
      (c) => c,
      90,
    );
    expect(r.gaps).toEqual([]);
  });
});

describe("compatibilidade: categoria legada de música ao vivo", () => {
  it("cotação antiga em 'musica_ao_vivo' continua cobrindo a necessidade 'banda'", () => {
    const r = composeWithCoverage(["banda"], [offer("banda-antiga", "musica_ao_vivo", 500_000)]);
    expect(r.required).toEqual(["banda"]);
    expect(r.uncovered).toEqual([]);
    expect(ids(r)).toEqual(["banda-antiga"]);
  });
});
