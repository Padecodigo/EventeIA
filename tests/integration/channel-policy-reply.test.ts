import { describe, expect, it } from "vitest";

import { CHANNEL_POLICY_PROMPT, CHANNEL_POLICY_REPLY } from "@/lib/ai/channel-policy";
import type { DeepSeekClient } from "@/lib/deepseek/client";
import { runAgent } from "@/lib/prospecting/agent-runtime";

function mockClient(raw: string, seen: { system?: string }): DeepSeekClient {
  return {
    complete: ({ messages }: { messages: { role: string; content: string }[] }) => {
      seen.system = messages.find((m) => m.role === "system")?.content;
      return Promise.resolve(raw);
    },
  } as unknown as DeepSeekClient;
}

describe("integração: contato pede WhatsApp na DM da postagem isca", () => {
  it("modelo (mock) oferece WhatsApp → resposta reescrita para Instagram/Messenger", async () => {
    const seen: { system?: string } = {};
    const reply = await runAgent({
      client: mockClient('{"reply":"Claro, me chama no WhatsApp (12) 99123-4567"}', seen),
      context: { category: "buffet", city: "Taubaté" },
      history: [{ role: "user", content: "Tem WhatsApp? Prefiro falar por lá" }],
    });
    expect(seen.system).toContain(CHANNEL_POLICY_PROMPT);
    expect(reply?.reply).toBe(CHANNEL_POLICY_REPLY);
    expect(reply?.reply).not.toMatch(/\d{4}-?\d{4}/);
  });

  it("modelo (mock) já responde certo → resposta preservada", async () => {
    const ok =
      "Atendemos só pelo Instagram e Messenger; siga nossa página no Instagram! Qual a data do evento?";
    const reply = await runAgent({
      client: mockClient(JSON.stringify({ reply: ok }), {}),
      context: { category: "buffet" },
      history: [{ role: "user", content: "me passa seu telefone" }],
    });
    expect(reply?.reply).toBe(ok);
  });

  it("pergunta 'é robô?' → resposta honesta (mock) preservada e sem canal externo", async () => {
    const honest = "Você está falando com o sistema de prospecção da EventeIA. Pode me mandar o valor do seu serviço por aqui?";
    const seen: { system?: string } = {};
    const reply = await runAgent({
      client: mockClient(JSON.stringify({ reply: honest }), seen),
      context: { category: "buffet" },
      history: [{ role: "user", content: "Sério, eu tô falando com uma pessoa ou com um robô?" }],
    });
    expect(seen.system).toMatch(/sistema de prospecção da EventeIA/);
    expect(seen.system).toMatch(/fora do roteiro/);
    expect(reply?.reply).toBe(honest);
  });
});
