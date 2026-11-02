import { describe, expect, it } from "vitest";

import {
  CHANNEL_POLICY_PROMPT,
  CHANNEL_POLICY_REPLY,
  CONVERSATION_TONE_PROMPT,
  IDENTITY_POLICY_PROMPT,
  enforceSocialOnlyReply,
  offersOffChannel,
} from "@/lib/ai/channel-policy";
import { buildSystemPrompt, parseAgentReply } from "@/lib/prospecting/agent";
import { PRIVATE_REPLY_OPENER } from "@/lib/prospecting/content";
import { IDENTITY_PHRASE } from "@/lib/quotes/triage";
import { buildSupplierReplyMessages, sanitizeSupplierReply } from "@/lib/quotes/triage";

const ctx = {
  eventTitle: "Festa",
  eventType: "aniversário",
  eventDateIso: "2026-12-10",
  city: "Taubaté",
  guestCount: 80,
  categoryLabel: "buffet",
  vendorName: "Buffet X",
};

describe("política de canal (somente Instagram e Messenger)", () => {
  it("prompt da regra cita Instagram, Messenger e proíbe WhatsApp/telefone/e-mail", () => {
    expect(CHANNEL_POLICY_PROMPT).toContain("Instagram e Messenger");
    expect(CHANNEL_POLICY_PROMPT).toMatch(/WhatsApp/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/NUNCA ofereça/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/a EventeIA, um serviço de prospecção autônomo/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/prospecção autônomo de fornecedores/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/orçamento ali mesmo, com o valor que cobra/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/seguir a página da EventeIA no Instagram/);
  });

  it("a regra está no prompt do agente de DM (isca) e da triagem de fornecedor", () => {
    expect(buildSystemPrompt({ category: "buffet" })).toContain(CHANNEL_POLICY_PROMPT);
    const system = buildSupplierReplyMessages("tem whats?", ctx)[0]?.content ?? "";
    expect(system).toContain(CHANNEL_POLICY_PROMPT);
  });

  it("resposta padrão reforça Instagram e não contém canal externo", () => {
    expect(CHANNEL_POLICY_REPLY).toMatch(/Instagram/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/Messenger/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/Somos a EventeIA, um serviço de prospecção autônomo/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/Atendemos/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/orçamento aqui mesmo, com o valor que você cobra/);
    expect(offersOffChannel(CHANNEL_POLICY_REPLY)).toBe(false);
  });

  it.each([
    "Claro! Me chama no WhatsApp (12) 99999-9999",
    "Pode mandar no zap",
    "Me manda um e-mail em contato@eventeia.com.br",
    "Posso te ligar amanhã?",
    "Nosso telefone é +55 12 98888 7777",
    "Fala comigo no Telegram",
  ])("detecta oferta fora do canal: %s", (text) => {
    expect(offersOffChannel(text)).toBe(true);
    expect(enforceSocialOnlyReply(text)).toBe(CHANNEL_POLICY_REPLY);
  });

  it.each([
    "Qual o valor para 80 convidados?",
    "Perfeito, o orçamento fica R$ 12.000,00 com prazo de 15 dias.",
  ])("mantém resposta normal: %s", (text) => {
    expect(enforceSocialOnlyReply(text)).toBe(text);
  });

  it("guarda aplicada no caminho do agente e da triagem", () => {
    const parsed = parseAgentReply('{"reply":"Me chama no whatsapp 12999998888"}');
    expect(parsed?.reply).toBe(CHANNEL_POLICY_REPLY);
    expect(sanitizeSupplierReply("Manda no email fulano@x.com")).toBe(CHANNEL_POLICY_REPLY);
  });

  it("identidade global: serviço autônomo, sem citar IA, sem mentir se perguntado", () => {
    expect(IDENTITY_POLICY_PROMPT).toMatch(/"a EventeIA, um serviço de prospecção autônomo"/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/em nome da empresa, na primeira pessoa do plural/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/no roteiro ou fora dele/);
    expect(IDENTITY_POLICY_PROMPT).toContain('literalmente a frase "somos a EventeIA"');
    expect(IDENTITY_POLICY_PROMPT).toMatch(
      /Nunca mencione nem sugira por conta própria que é uma IA/,
    );
    expect(IDENTITY_POLICY_PROMPT).toMatch(/não minta/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/nunca diga que é humano/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/não use "serviço autônomo" como resposta a essa pergunta/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/sistema de prospecção da EventeIA/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/retome o pedido de orçamento/);
    const prompts = [
      buildSystemPrompt({ category: "buffet" }),
      buildSupplierReplyMessages("oi", ctx)[0]?.content ?? "",
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain(IDENTITY_POLICY_PROMPT);
      expect(prompt).toContain(CONVERSATION_TONE_PROMPT);
      expect(prompt).not.toMatch(/Você é o assistente/);
      expect(prompt).not.toMatch(/NUNCA negue ser um assistente virtual/);
    }
    expect(CHANNEL_POLICY_REPLY).not.toMatch(/\bIA\b|intelig[eê]ncia artificial|rob[oô]|chatbot/i);
  });

  it("tom: perguntas fora do roteiro com resposta natural e curta, voltando ao orçamento", () => {
    expect(CONVERSATION_TONE_PROMPT).toMatch(/Instagram e no Messenger/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(/fora do roteiro/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(/natural, humana e nada robótica/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(/curta e conversacional/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(/redirecione para o orçamento/);
  });

  it('abertura e autoidentificação contêm literalmente "somos a EventeIA"', () => {
    for (const text of [PRIVATE_REPLY_OPENER, CHANNEL_POLICY_REPLY, IDENTITY_PHRASE]) {
      expect(text.toLowerCase()).toContain("somos a eventeia");
    }
    expect(PRIVATE_REPLY_OPENER).toMatch(/^Oi! Somos a EventeIA, um serviço de prospecção autônomo/);
    expect(offersOffChannel(PRIVATE_REPLY_OPENER)).toBe(false);
  });
});
