import { describe, expect, it } from "vitest";

import { CHANNEL_POLICY_PROMPT, CHANNEL_POLICY_REPLY } from "@/lib/ai/channel-policy";
import type { DeepSeekClient } from "@/lib/deepseek/client";
import { buildSystemPrompt, parseAgentReply } from "@/lib/prospecting/agent";
import { runAgent } from "@/lib/prospecting/agent-runtime";
import { coerceStructuredQuote } from "@/lib/prospecting/quote";

const context = { category: "bartender", supplierKnown: true };
const insist = [
  { role: "user" as const, content: "Só trabalho com orçamento pelo WhatsApp mesmo." },
];

function clientFrom(outputs: string[]): DeepSeekClient & { calls: number } {
  const c = {
    mode: "mock" as const,
    calls: 0,
    complete: () => {
      c.calls += 1;
      return Promise.resolve(outputs[Math.min(c.calls - 1, outputs.length - 1)] ?? "");
    },
  };
  return c;
}

describe("saída vazia do modelo (regressão do dry-run)", () => {
  it("tenta de novo quando a primeira saída é só espaço", async () => {
    const client = clientFrom([
      "  \n ",
      JSON.stringify({ reply: "Pode ser por aqui, qual o valor?", quote: null }),
    ]);
    const reply = await runAgent({ client, context, history: insist });
    expect(client.calls).toBe(2);
    expect(reply?.reply).toBe("Pode ser por aqui, qual o valor?");
  });

  it("vazio duas vezes vira resposta natural pedindo o valor, nunca null", async () => {
    const client = clientFrom(["   ", "\n"]);
    const reply = await runAgent({ client, context, history: insist });
    expect(reply).not.toBeNull();
    expect(reply?.reply).toMatch(/por aqui mesmo/i);
    expect(reply?.reply).toMatch(/valor/i);
    expect(reply?.reply).not.toMatch(/whats|telefone|e-?mail/i);
    expect(reply?.escalate).toBe(false);
  });

  it("saída não vazia e inválida continua null", () => {
    expect(parseAgentReply("lixo")).toBeNull();
  });
});

describe("conversa já no Direct da @eventeia", () => {
  it("o fallback fixo não manda falar 'por lá'", () => {
    expect(CHANNEL_POLICY_REPLY).not.toMatch(/por lá|chama a gente|fechar/i);
    expect(CHANNEL_POLICY_REPLY).toContain("siga a @eventeia");
  });

  it("o prompt proíbe 'chama a gente no @eventeia' / 'fechar por lá'", () => {
    expect(CHANNEL_POLICY_PROMPT).toContain("JÁ acontece no Direct da @eventeia");
    expect(CHANNEL_POLICY_PROMPT).toContain("fechar por lá");
    expect(buildSystemPrompt(context)).toContain("no máximo convide a seguir a página");
  });

  it("o prompt trata 'vou ligar no número comercial' mantendo a conversa aqui", () => {
    expect(buildSystemPrompt(context)).toMatch(/número comercial.*seguir por aqui mesmo/);
  });
});

describe("preço por convidado", () => {
  it("R$ 85 por convidado com 60 convidados → unitário 8500, total 510000", () => {
    const q = coerceStructuredQuote({
      product: "Pacote premium",
      volume: 60,
      unitPriceCents: 8500,
      priceCents: null,
    });
    expect(q?.unitPriceCents).toBe(8500);
    expect(q?.priceCents).toBe(510000);
  });

  it("corrige quando o modelo põe o unitário em priceCents", () => {
    const q = coerceStructuredQuote({
      product: "Pacote",
      volume: "60 convidados",
      unitPriceCents: 8500,
      priceCents: 8500,
    });
    expect(q?.priceCents).toBe(510000);
  });

  it("sem número de convidados mantém só o unitário", () => {
    const q = coerceStructuredQuote({ product: "Pacote", unitPriceCents: "8500" });
    expect(q?.unitPriceCents).toBe(8500);
    expect(q?.priceCents).toBeNull();
  });

  it("o prompt orienta unitPriceCents para preço por convidado", () => {
    expect(buildSystemPrompt(context)).toContain("unitPriceCents (8500)");
  });

  it("cotação total explícita não é alterada", () => {
    const q = coerceStructuredQuote({
      product: "Open bar",
      volume: 60,
      priceCents: 480000,
      unitPriceCents: 8500,
    });
    expect(q?.priceCents).toBe(480000);
  });
});
