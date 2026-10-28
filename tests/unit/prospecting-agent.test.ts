import { describe, expect, it } from "vitest";

import { buildAgentMessages, buildSystemPrompt, parseAgentReply } from "@/lib/prospecting/agent";
import { runAgent } from "@/lib/prospecting/agent-runtime";
import type { DeepSeekClient } from "@/lib/deepseek/client";

const context = { category: "buffet", city: "Taubaté", guestCount: 100, maxPriceCents: 300000, maxDeadlineDays: 15 };

describe("prompt do agente", () => {
  it("contém as regras críticas e os critérios de fechamento", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("assistente virtual");
    expect(prompt).toContain("NUNCA invente preço");
    expect(prompt).toContain("opt_out=true");
    expect(prompt).toContain("escalate=true");
    expect(prompt).toContain("300000 centavos");
    expect(prompt).toContain("15 dias");
    expect(prompt).toContain("Taubaté");
  });

  it("monta as mensagens com o system prompt na frente do histórico", () => {
    const messages = buildAgentMessages(context, [
      { role: "user", content: "olá" },
      { role: "assistant", content: "oi" },
      { role: "user", content: "buffet para 100" },
    ]);
    expect(messages[0]?.role).toBe("system");
    expect(messages).toHaveLength(4);
  });
});

describe("parse da resposta do agente", () => {
  it("valida resposta com cotação e flags", () => {
    const reply = parseAgentReply(
      JSON.stringify({
        reply: "Anotei: buffet para 100, R$ 2.500, prazo 10 dias.",
        quote: {
          product: "buffet",
          specifications: "finger food",
          volume: 100,
          moq: null,
          priceCents: 250000,
          deadlineDays: 10,
          shippingCents: null,
          paymentTerms: null,
          validUntil: null,
        },
        escalate: false,
        done: true,
        opt_out: false,
      }),
    );
    expect(reply?.quote?.priceCents).toBe(250000);
    expect(reply?.done).toBe(true);
  });

  it("rejeita JSON inválido ou fora do schema", () => {
    expect(parseAgentReply("não é json")).toBeNull();
    expect(parseAgentReply(JSON.stringify({ reply: "" }))).toBeNull();
    expect(parseAgentReply(JSON.stringify({ reply: "ok", quote: { product: "x", priceCents: 1.5 } }))).toBeNull();
  });

  it("aceita opt-out", () => {
    expect(parseAgentReply(JSON.stringify({ reply: "Tudo bem, até logo.", opt_out: true }))?.optOut).toBe(true);
  });
});

describe("runtime do agente", () => {
  it("chama o client e devolve a resposta parseada", async () => {
    const client: DeepSeekClient = {
      mode: "mock",
      complete: () =>
        Promise.resolve(JSON.stringify({ reply: "Qual o valor do buffet?", quote: null, escalate: false, done: false })),
    };
    const reply = await runAgent({ client, context, history: [{ role: "user", content: "oi" }] });
    expect(reply?.reply).toBe("Qual o valor do buffet?");
  });

  it("devolve null quando o modelo devolve algo inválido", async () => {
    const client: DeepSeekClient = { mode: "mock", complete: () => Promise.resolve("lixo") };
    expect(await runAgent({ client, context, history: [] })).toBeNull();
  });
});


describe("agente sem fornecedor identificado (Messenger)", () => {
  it("pede nome do negócio e @ do Instagram", () => {
    const prompt = buildSystemPrompt({ category: "evento", supplierKnown: false });
    expect(prompt).toContain("pergunte o nome do negócio");
    expect(prompt).toContain("@ do Instagram");
  });

  it("não pede identificação quando o fornecedor é conhecido", () => {
    const prompt = buildSystemPrompt({ category: "buffet", supplierKnown: true });
    expect(prompt).not.toContain("pergunte o nome do negócio");
  });
});
