import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiCompatibleClient,
  DEEPSEEK_MIN_MAX_TOKENS,
  EmptyCompletionError,
} from "@/lib/ai/clients";

type Body = { max_tokens: number; thinking?: { type: string } };

function fakeFetch(replies: Array<{ content: string; finish_reason: string }>) {
  const bodies: Body[] = [];
  const impl = vi.fn((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Body);
    const r = replies.shift() ?? { content: "", finish_reason: "length" };
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: r.content }, finish_reason: r.finish_reason }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
  });
  return { impl: impl as unknown as typeof fetch, bodies };
}

describe("DeepSeek reasoning: resposta vazia por finish_reason length (regressão)", () => {
  it("retenta com orçamento maior e thinking desativado, e loga", async () => {
    const { impl, bodies } = fakeFetch([
      { content: "", finish_reason: "length" },
      { content: '{"ok":true}', finish_reason: "stop" },
    ]);
    const onWarn = vi.fn();
    const c = createOpenAiCompatibleClient({
      name: "deepseek",
      apiKey: "k",
      fetchImpl: impl,
      onWarn,
    });
    const res = await c.complete({
      messages: [{ role: "user", content: "x" }],
      maxTokens: 60,
      json: true,
      task: "negotiation",
    });
    expect(res.content).toBe('{"ok":true}');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.max_tokens).toBeGreaterThan(bodies[0]?.max_tokens ?? 0);
    expect(bodies[1]?.thinking).toEqual({ type: "disabled" });
    expect(res.outputTokens).toBe(10);
    expect(onWarn).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: "length", task: "negotiation" }),
      expect.any(String),
    );
  });

  it("vazio após retentativa vira erro explícito (não sucesso silencioso)", async () => {
    const { impl } = fakeFetch([]);
    const c = createOpenAiCompatibleClient({ name: "deepseek", apiKey: "k", fetchImpl: impl });
    await expect(
      c.complete({
        messages: [{ role: "user", content: "x" }],
        maxTokens: 60,
        json: true,
        task: "classification",
      }),
    ).rejects.toBeInstanceOf(EmptyCompletionError);
  });

  it("tarefas curtas desativam thinking; tarefas abertas recebem piso de max_tokens", async () => {
    const { impl, bodies } = fakeFetch([
      { content: "{}", finish_reason: "stop" },
      { content: "{}", finish_reason: "stop" },
    ]);
    const c = createOpenAiCompatibleClient({ name: "deepseek", apiKey: "k", fetchImpl: impl });
    await c.complete({
      messages: [{ role: "user", content: "x" }],
      maxTokens: 60,
      json: true,
      task: "classification",
    });
    await c.complete({
      messages: [{ role: "user", content: "x" }],
      maxTokens: 60,
      json: true,
      task: "negotiation",
    });
    expect(bodies[0]).toMatchObject({ max_tokens: 60, thinking: { type: "disabled" } });
    expect(bodies[1]?.max_tokens).toBe(DEEPSEEK_MIN_MAX_TOKENS);
    expect(bodies[1]?.thinking).toBeUndefined();
  });

  it("outros provedores não recebem o parâmetro thinking", async () => {
    const { impl, bodies } = fakeFetch([{ content: "{}", finish_reason: "stop" }]);
    const c = createOpenAiCompatibleClient({ name: "grok", apiKey: "k", fetchImpl: impl });
    await c.complete({
      messages: [{ role: "user", content: "x" }],
      maxTokens: 60,
      json: true,
      task: "classification",
    });
    expect(bodies[0]).toMatchObject({ max_tokens: 60 });
    expect(bodies[0]?.thinking).toBeUndefined();
  });
});
