import { describe, expect, it } from "vitest";

import { createMockLlmClient, DEFAULT_DEEPSEEK_MODEL, LLM_ENDPOINTS } from "@/lib/ai/clients";
import { contingencyClassification, contingencyFirstReply, contingencyHiddenFees } from "@/lib/ai/contingency";
import {
  createMemoryLedger,
  createRouter,
  providerOrder,
  type LlmClient,
  type LlmProviderName,
  type PriceTable,
} from "@/lib/ai/router";
import { routeClassification, routeFirstReplyParsing, routeHiddenFeeScan, routeQuotationExtraction } from "@/lib/ai/tasks";

const prices: PriceTable = {
  nim: { inPer1M: 100_000, outPer1M: 400_000 },
  grok: { inPer1M: 3_000_000, outPer1M: 15_000_000 },
  deepseek: { inPer1M: 300_000, outPer1M: 1_200_000 },
};
const cap = { switchPct: 25, bootstrapMicroUsd: 0 };

function failing(name: LlmProviderName): LlmClient & { calls: number } {
  const c = {
    name,
    calls: 0,
    complete: () => {
      c.calls += 1;
      return Promise.reject(new Error("HTTP 503"));
    },
  };
  return c;
}

describe("DeepSeek como cérebro primário", () => {
  it("ordem: DeepSeek primeiro; NIM/Grok como fallback", () => {
    const all: LlmProviderName[] = ["nim", "grok", "deepseek"];
    expect(providerOrder("quotation_extraction", all)).toEqual(["deepseek", "nim", "grok"]);
    expect(providerOrder("hidden_fee_scan", all)).toEqual(["deepseek", "nim", "grok"]);
    expect(providerOrder("negotiation", all)).toEqual(["deepseek", "grok", "nim"]);
    expect(providerOrder("optout_intent", all)).toEqual(["deepseek", "grok", "nim"]);
    // busca ao vivo só existe no Grok
    expect(providerOrder("discovery_search", all)[0]).toBe("grok");
  });

  it("modelo padrão é o documentado (sem id inventado) e sobrescrevível por env", () => {
    expect(DEFAULT_DEEPSEEK_MODEL).toBe("deepseek-flash");
    expect(LLM_ENDPOINTS.deepseek.model).toBe(DEFAULT_DEEPSEEK_MODEL);
  });

  it("DeepSeek responde e o NIM nem é chamado", async () => {
    const nim = failing("nim");
    const ledger = createMemoryLedger();
    const r = createRouter({ clients: [nim, createMockLlmClient("deepseek")], ledger, prices, cap });
    const out = await routeQuotationExtraction(r, [{ role: "user", content: "Buffet R$ 3.000,00" }], "Buffet R$ 3.000,00");
    expect(out.provider).toBe("deepseek");
    expect(out.value.total_price_cents).toBe(300000);
    expect(nim.calls).toBe(0);
    expect(ledger.entries[0]?.provider).toBe("deepseek");
  });

  it("DeepSeek fora ⇒ NIM; ambos fora e Grok no teto ⇒ contingência", async () => {
    const r1 = createRouter({ clients: [failing("deepseek"), createMockLlmClient("nim")], ledger: createMemoryLedger(), prices, cap });
    expect((await routeHiddenFeeScan(r1, "Taxa de limpeza R$ 200,00")).provider).toBe("nim");

    const ledger = createMemoryLedger();
    await ledger.record({ provider: "deepseek", task: "classification", inputTokens: 0, outputTokens: 0, costMicroUsd: 10, outcome: "ok" });
    const grok = createMockLlmClient("grok");
    const r2 = createRouter({ clients: [failing("deepseek"), failing("nim"), grok], ledger, prices, cap });
    const out = await routeFirstReplyParsing(r2, "Quanto custa? Qual a data?");
    expect(out.provider).toBe("contingency");
    expect(out.attempts.map((a) => a.outcome)).toEqual(["error", "error", "capped"]);
    expect(out.value.intent).toBe("needs_info");
  });

  it("baixa confiança do DeepSeek ⇒ tenta o próximo", async () => {
    const r = createRouter({
      clients: [createMockLlmClient("deepseek", 0.5), createMockLlmClient("nim", 0.9)],
      ledger: createMemoryLedger(),
      prices,
      cap,
    });
    const out = await routeClassification(r, "Fazemos bolos e doces finos", ["buffet", "doces", "decoracao"]);
    expect(out.provider).toBe("nim");
    expect(out.value.category).toBe("doces");
    expect(out.attempts[0]).toEqual({ provider: "deepseek", outcome: "low_confidence" });
  });

  it("classificação rejeita categoria fora da lista (zod)", async () => {
    const liar: LlmClient = {
      name: "deepseek",
      complete: () => Promise.resolve({ content: '{"category":"hackeado","confidence_score":0.99}' }),
    };
    const r = createRouter({ clients: [liar], ledger: createMemoryLedger(), prices, cap });
    const out = await routeClassification(r, "buffet completo", ["buffet"]);
    expect(out.provider).toBe("contingency");
    expect(out.value.category).toBe("buffet");
  });
});

describe("contingências das novas tarefas", () => {
  it("1ª resposta", () => {
    expect(contingencyFirstReply("Pacote fica R$ 1.200,00").intent).toBe("quote");
    expect(contingencyFirstReply("Não tenho interesse, obrigado").intent).toBe("decline");
    expect(contingencyFirstReply("Te passo amanhã").intent).toBe("later");
    expect(contingencyFirstReply("Para quantas pessoas? É sábado?").questions).toHaveLength(2);
  });

  it("taxas ocultas e classificação", () => {
    expect(contingencyHiddenFees("Frete R$ 150,00").fees[0]).toMatchObject({ category: "delivery_pickup", amount_cents: 15000 });
    expect(contingencyClassification("Decoração provençal", ["buffet", "decoracao"]).category).toBe("decoracao");
    expect(contingencyClassification("olá", ["buffet"]).category).toBeNull();
  });
});
