import { describe, expect, it, vi } from "vitest";

import { createOpenAiCompatibleClient } from "@/lib/ai/clients";
import { contingencyOptOut, contingencyQuotation, parseBRLAmounts } from "@/lib/ai/contingency";
import {
  costMicroUsd,
  createMemoryLedger,
  createRouter,
  estimateTokens,
  grokWithinCap,
  providerOrder,
  type LlmClient,
  type LlmProviderName,
  type PriceTable,
} from "@/lib/ai/router";
import { routeOptOutIntent, routeQuotationExtraction } from "@/lib/ai/tasks";

const prices: PriceTable = {
  nim: { inPer1M: 100_000, outPer1M: 400_000 },
  grok: { inPer1M: 3_000_000, outPer1M: 15_000_000 },
  deepseek: { inPer1M: 270_000, outPer1M: 1_100_000 },
};
const cap = { switchPct: 25, bootstrapMicroUsd: 0 };

const quotation = (confidence: number) =>
  JSON.stringify({
    total_price_cents: 250000,
    base_price_cents: 220000,
    mandatory_fees: [],
    item_breakdown: [],
    validity_days: 10,
    payment_conditions: null,
    confidence_score: confidence,
  });

function client(name: LlmProviderName, reply: string | Error): LlmClient & { calls: number } {
  const c = {
    name,
    calls: 0,
    complete: () => {
      c.calls += 1;
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve({ content: reply, inputTokens: 1000, outputTokens: 200 });
    },
  };
  return c;
}
const msgs = [{ role: "user" as const, content: "Buffet R$ 2.500,00" }];

describe("custo e teto", () => {
  it("calcula custo em micro-USD e estima tokens", () => {
    expect(costMicroUsd(prices.grok, 1_000_000, 0)).toBe(3_000_000);
    expect(costMicroUsd(prices.nim, 1000, 200)).toBe(180);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
  it("Grok só cabe até 25% do custo acumulado (checagem antes da chamada)", () => {
    expect(grokWithinCap({ costByProvider: { nim: 750, grok: 0 } }, 250, cap)).toBe(true);
    expect(grokWithinCap({ costByProvider: { nim: 750, grok: 0 } }, 251, cap)).toBe(false);
    expect(grokWithinCap({ costByProvider: {} }, 10, cap)).toBe(false);
    expect(grokWithinCap({ costByProvider: {} }, 10, { switchPct: 25, bootstrapMicroUsd: 100 })).toBe(true);
  });
  it("ordem: NIM primeiro em extração; Grok primeiro em negociação/opt-out", () => {
    expect(providerOrder("quotation_extraction", ["grok", "nim"])).toEqual(["nim", "grok"]);
    expect(providerOrder("negotiation", ["grok", "nim"])).toEqual(["grok", "nim"]);
    expect(providerOrder("classification", ["nim", "deepseek"])).toEqual(["nim", "deepseek"]);
  });
});

describe("cadeia de fallback", () => {
  it("NIM válido resolve sem tocar no Grok", async () => {
    const nim = client("nim", quotation(0.9));
    const grok = client("grok", quotation(0.95));
    const ledger = createMemoryLedger();
    const r = createRouter({ clients: [nim, grok], ledger, prices, cap });
    const out = await routeQuotationExtraction(r, msgs, "Buffet R$ 2.500,00");
    expect(out.provider).toBe("nim");
    expect(grok.calls).toBe(0);
    expect(ledger.entries[0]).toMatchObject({ provider: "nim", costMicroUsd: 180, outcome: "ok" });
  });

  it("NIM com confiança < 0.7 escala para o Grok quando cabe no teto", async () => {
    const ledger = createMemoryLedger();
    await ledger.record({ provider: "nim", task: "classification", inputTokens: 0, outputTokens: 0, costMicroUsd: 1_000_000, outcome: "ok" });
    const r = createRouter({ clients: [client("nim", quotation(0.5)), client("grok", quotation(0.95))], ledger, prices, cap });
    const out = await routeQuotationExtraction(r, msgs, "x");
    expect(out.provider).toBe("grok");
    expect(out.attempts.map((a) => a.outcome)).toEqual(["low_confidence", "ok"]);
  });

  it("Grok acima do teto é bloqueado (alerta) e cai na contingência determinística", async () => {
    const alert = vi.fn();
    const grok = client("grok", quotation(0.95));
    const r = createRouter({ clients: [client("nim", "não é json"), grok], ledger: createMemoryLedger(), prices, cap, onCapAlert: alert });
    const out = await routeQuotationExtraction(r, msgs, "Buffet R$ 2.500,00 + taxa de limpeza R$ 300,00");
    expect(grok.calls).toBe(0);
    expect(alert).toHaveBeenCalledOnce();
    expect(out.provider).toBe("contingency");
    expect(out.value.total_price_cents).toBe(250000);
    expect(out.value.mandatory_fees[0]).toMatchObject({ category: "cleaning", amount_cents: 30000 });
    expect(out.attempts.map((a) => a.outcome)).toEqual(["invalid", "capped"]);
  });

  it("todos falham ⇒ contingência; o fluxo nunca trava", async () => {
    const r = createRouter({ clients: [client("nim", new Error("HTTP 500"))], ledger: createMemoryLedger(), prices, cap });
    const out = await routeOptOutIntent(r, "não quero mais, me tira da lista");
    expect(out.provider).toBe("contingency");
    expect(out.value.opt_out).toBe(true);
  });

  it("opt-out coloquial vai primeiro ao Grok (se couber)", async () => {
    const grok = client("grok", '{"opt_out":true,"confidence_score":0.9}');
    const r = createRouter({ clients: [client("nim", '{"opt_out":false,"confidence_score":0.9}'), grok], ledger: createMemoryLedger(), prices, cap: { switchPct: 25, bootstrapMicroUsd: 1_000_000 } });
    const out = await routeOptOutIntent(r, "valeu, mas tô fora dessa");
    expect(out.provider).toBe("grok");
  });
});

describe("contingência e cliente", () => {
  it("parser de valores em BRL", () => {
    expect(parseBRLAmounts("R$ 1.500,00 e 300 reais e R$ 99,9")).toEqual([150000, 30000, 9990]);
    expect(contingencyQuotation("sem preço").total_price_cents).toBeNull();
    expect(contingencyOptOut("SAIR").opt_out).toBe(true);
  });
  it("cliente OpenAI-compatível lê usage de tokens (fetch mockado)", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }))),
    ) as unknown as typeof fetch;
    const c = createOpenAiCompatibleClient({ name: "nim", apiKey: "k", fetchImpl });
    expect(await c.complete({ messages: msgs, maxTokens: 10, json: true })).toEqual({ content: "{}", inputTokens: 12, outputTokens: 3 });
  });
});
