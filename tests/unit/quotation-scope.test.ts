import { describe, expect, it } from "vitest";

import type { DeepSeekClient } from "@/lib/deepseek/client";
import { EXTRACTION_SYSTEM_PROMPT, extractQuotationFromText } from "@/lib/deepseek/extractor";
import { normalizeScopeItem, SCOPE_COVERS } from "@/lib/quotes/scope-items";
import { EMPTY_QUOTATION, nuancedQuotationSchema } from "@/lib/schemas/quotation-extraction";

const fake = (content: string): DeepSeekClient => ({
  mode: "mock",
  complete: () => Promise.resolve(content),
});

const base = {
  total_price_cents: 900000,
  base_price_cents: 900000,
  mandatory_fees: [],
  item_breakdown: [],
  validity_days: null,
  payment_conditions: null,
  confidence_score: 0.9,
};

describe("escopo estruturado (inclui / não inclui)", () => {
  it("aceita escopo com preço separado e normaliza sinônimos", () => {
    const q = nuancedQuotationSchema.parse({
      ...base,
      scope: [
        { item: "comida", status: "inclui" },
        { item: "Garçons", status: "inclui" },
        { item: "louça", status: "nao_inclui", price_cents: 36000 },
        { item: "lavagem de louça", status: "nao_inclui", price_cents: null },
      ],
    });
    expect(q.scope.map((s) => s.item)).toEqual([
      "comida",
      "garcons",
      "louca_talheres",
      "lavagem_louca",
    ]);
    expect(q.scope[2]?.price_cents).toBe(36000);
    expect(q.scope[0]?.price_cents).toBeNull();
  });
  it("regressão: resposta sem 'scope' continua válida (default [])", () => {
    expect(nuancedQuotationSchema.parse(base).scope).toEqual([]);
    expect(EMPTY_QUOTATION.scope).toEqual([]);
  });
  it("rejeita status fora do enum e preço fracionário", () => {
    expect(
      nuancedQuotationSchema.safeParse({ ...base, scope: [{ item: "limpeza", status: "talvez" }] })
        .success,
    ).toBe(false);
    expect(
      nuancedQuotationSchema.safeParse({
        ...base,
        scope: [{ item: "limpeza", status: "inclui", price_cents: 1.5 }],
      }).success,
    ).toBe(false);
  });
  it("normalização cobre casos do usuário e desconhecido vira 'outro'", () => {
    expect(normalizeScopeItem("mão de obra")).toBe("mao_de_obra");
    expect(normalizeScopeItem("Mesas e cadeiras")).toBe("mesas_cadeiras");
    expect(normalizeScopeItem("entrega")).toBe("frete_entrega");
    expect(normalizeScopeItem("retirada")).toBe("recolhimento");
    expect(normalizeScopeItem("van para convidados")).toBe("transporte_convidados");
    expect(normalizeScopeItem("xpto")).toBe("outro");
  });
  it("itens que dispensam outra categoria", () => {
    expect(SCOPE_COVERS.garcons).toBe("garcons");
    expect(SCOPE_COVERS.limpeza).toBe("limpeza");
    expect(SCOPE_COVERS.mesas_cadeiras).toBe("mobiliario");
    expect(SCOPE_COVERS.frete_entrega).toBeUndefined();
  });
  it("prompt pede o escopo e preço separado", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("scope");
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/nao_inclui/);
  });
});

describe("integração: extrator com escopo", () => {
  it("extrai escopo de um buffet só com comida (louça e garçons à parte)", async () => {
    const json = JSON.stringify({
      ...base,
      scope: [
        { item: "comida", status: "inclui" },
        { item: "garcons", status: "nao_inclui", price_cents: 80000 },
        { item: "louca_talheres", status: "nao_inclui" },
      ],
    });
    const r = await extractQuotationFromText("texto", fake(json));
    expect(r.status).toBe("success");
    expect(r.quotation.scope).toHaveLength(3);
    expect(r.quotation.scope[1]).toMatchObject({
      item: "garcons",
      status: "nao_inclui",
      price_cents: 80000,
    });
  });
  it("schema inválido em outro campo preserva o escopo válido no parcial", async () => {
    const json = JSON.stringify({
      ...base,
      mandatory_fees: "x",
      scope: [{ item: "limpeza", status: "inclui" }],
    });
    const r = await extractQuotationFromText("texto", fake(json));
    expect(r.status).toBe("parsing_failed");
    expect(r.quotation.scope).toEqual([{ item: "limpeza", status: "inclui", price_cents: null }]);
    expect(r.quotation.confidence_score).toBe(0);
  });
});
