import { describe, expect, it, vi } from "vitest";

import { createOpenAiCompatibleClient } from "@/lib/ai/clients";
import { createMemoryLedger, createRouter, type PriceTable } from "@/lib/ai/router";
import { routeOptOutIntent } from "@/lib/ai/tasks";

/**
 * Integração: roteador real + cliente DeepSeek real + API simulada que imita o modelo
 * com raciocínio (consome max_tokens antes do conteúdo quando thinking está ativo).
 */
const prices: PriceTable = {
  nim: { inPer1M: 1, outPer1M: 1 },
  grok: { inPer1M: 1, outPer1M: 1 },
  deepseek: { inPer1M: 300_000, outPer1M: 1_200_000 },
};

function reasoningApi() {
  const bodies: Record<string, unknown>[] = [];
  const impl = vi.fn((_u: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as {
      max_tokens: number;
      thinking?: { type: string };
    };
    bodies.push(body);
    const thinking = body.thinking?.type !== "disabled";
    const reasoning = 500;
    const ok = !thinking || body.max_tokens > reasoning + 30;
    const payload = {
      choices: [
        {
          message: { content: ok ? '{"opt_out":true,"confidence_score":0.95}' : "" },
          finish_reason: ok ? "stop" : "length",
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: ok ? 20 + (thinking ? reasoning : 0) : body.max_tokens,
      },
    };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  });
  return { impl: impl as unknown as typeof fetch, bodies };
}

describe("roteador + DeepSeek com raciocínio", () => {
  it("tarefa curta (60 tokens) responde pelo DeepSeek, sem cair na contingência, e registra uso", async () => {
    const { impl, bodies } = reasoningApi();
    const ledger = createMemoryLedger();
    const onAttemptFailure = vi.fn();
    const router = createRouter({
      clients: [createOpenAiCompatibleClient({ name: "deepseek", apiKey: "k", fetchImpl: impl })],
      ledger,
      prices,
      cap: { switchPct: 25, bootstrapMicroUsd: 0 },
      onAttemptFailure,
    });
    const r = await routeOptOutIntent(router, "não me mande mais mensagens");
    expect(r.provider).toBe("deepseek");
    expect(r.value.opt_out).toBe(true);
    expect(bodies[0]).toMatchObject({ thinking: { type: "disabled" } });
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      provider: "deepseek",
      outcome: "ok",
      task: "optout_intent",
    });
    expect(onAttemptFailure).not.toHaveBeenCalled();
  });

  it("falha persistente é logada via onAttemptFailure antes da contingência", async () => {
    const impl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    const onAttemptFailure = vi.fn();
    const router = createRouter({
      clients: [createOpenAiCompatibleClient({ name: "deepseek", apiKey: "k", fetchImpl: impl })],
      ledger: createMemoryLedger(),
      prices,
      cap: { switchPct: 25, bootstrapMicroUsd: 0 },
      onAttemptFailure,
    });
    const r = await routeOptOutIntent(router, "pare");
    expect(r.provider).toBe("contingency");
    expect(onAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        outcome: "error",
        error: expect.stringContaining("finish_reason=length") as unknown as string,
      }),
    );
  });
});
