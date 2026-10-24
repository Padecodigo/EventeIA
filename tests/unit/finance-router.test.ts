import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createLlmClientForTest } from "./helpers/llm-usage-client";
import { createMemoryLedger, createRouter, type PriceTable } from "@/lib/ai/router";
import { deepseekCost } from "@/lib/finance/pricing";

const prices: PriceTable = {
  nim: { inPer1M: 0, outPer1M: 0 },
  grok: { inPer1M: 0, outPer1M: 0 },
  deepseek: { inPer1M: 300_000, outPer1M: 1_200_000 },
};

describe("roteador → ledger financeiro", () => {
  it("usa o usage real (cache hit/miss) e a tarifa de pico; grava evento e motivo", async () => {
    const ledger = createMemoryLedger();
    const router = createRouter({
      clients: [createLlmClientForTest({ inputTokens: 10_000, outputTokens: 1_000, cacheHitTokens: 4_000 })],
      ledger,
      prices,
      cap: { switchPct: 25, bootstrapMicroUsd: 0 },
      now: () => new Date("2026-10-26T07:30:00Z"), // segunda, pico
      cost: (p, u, at) =>
        p === "deepseek"
          ? deepseekCost({ cacheHitTokens: u.cacheHitTokens, cacheMissTokens: u.inputTokens - u.cacheHitTokens, outputTokens: u.outputTokens }, at)
          : null,
    });
    await router.run({
      task: "quotation_extraction",
      messages: [{ role: "user", content: "x" }],
      schema: z.object({ ok: z.boolean() }),
      contingency: () => ({ ok: false }),
      meta: { eventId: "e1", reason: "extraction" },
    });
    // pico: 4000*6000 + 6000*300000 + 1000*1200000 = 3_024_000_000 / 1e6 = 3024
    expect(ledger.entries[0]).toMatchObject({ provider: "deepseek", costMicroUsd: 3024, peak: true, cacheHitTokens: 4000, eventId: "e1", reason: "extraction" });
  });
});
