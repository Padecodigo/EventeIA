import { describe, expect, it } from "vitest";

import {
  CHANNEL_POLICY_PROMPT,
  CHANNEL_POLICY_REPLY,
  COMPANY_FACTS_PROMPT,
  CONVERSATION_TONE_PROMPT,
  IDENTITY_POLICY_PROMPT,
  enforceSocialOnlyReply,
  offersOffChannel,
} from "@/lib/ai/channel-policy";
import { buildSystemPrompt, parseAgentReply } from "@/lib/prospecting/agent";
import { PRIVATE_REPLY_OPENER } from "@/lib/prospecting/content";
import {
  buildSupplierReplyMessages,
  IDENTITY_PHRASE,
  sanitizeSupplierReply,
} from "@/lib/quotes/triage";

const ctx = {
  eventTitle: "Festa",
  eventType: "aniversário",
  eventDateIso: "2026-12-10",
  city: "Taubaté",
  guestCount: 80,
  categoryLabel: "buffet",
  vendorName: "Buffet X",
};

const prompts = () => [
  buildSystemPrompt({ category: "buffet" }),
  buildSupplierReplyMessages("oi", ctx)[0]?.content ?? "",
];

describe("política de canal (somente Instagram e Messenger)", () => {
  it("regra cita Instagram/Messenger, @eventeia, pede orçamento e proíbe outros canais", () => {
    expect(CHANNEL_POLICY_PROMPT).toContain("Instagram e Messenger");
    expect(CHANNEL_POLICY_PROMPT).toMatch(/WhatsApp/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/reconheça o pedido com naturalidade/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/@eventeia/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/valor que cobra pelo serviço/);
    expect(CHANNEL_POLICY_PROMPT).toMatch(/NUNCA ofereça/);
  });

  it("todas as regras estão nos dois prompts de resposta (DM isca e triagem)", () => {
    for (const prompt of prompts()) {
      for (const rule of [
        CHANNEL_POLICY_PROMPT,
        IDENTITY_POLICY_PROMPT,
        CONVERSATION_TONE_PROMPT,
        COMPANY_FACTS_PROMPT,
      ]) {
        expect(prompt).toContain(rule);
      }
      expect(prompt).not.toMatch(/Você é o assistente/);
    }
  });

  it("fallback fixo: curto, Instagram preferido, pede o valor, sem canal externo", () => {
    expect(CHANNEL_POLICY_REPLY).toMatch(/Instagram/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/Messenger/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/@eventeia/);
    expect(CHANNEL_POLICY_REPLY).toMatch(/valor que você cobra pelo serviço/);
    expect(CHANNEL_POLICY_REPLY.length).toBeLessThanOrEqual(250);
    expect(CHANNEL_POLICY_REPLY.toLowerCase()).not.toContain("somos a eventeia");
    expect(offersOffChannel(CHANNEL_POLICY_REPLY)).toBe(false);
  });

  it.each([
    "Claro! Me chama no WhatsApp (12) 99999-9999",
    "Pode mandar no zap",
    "Me manda um e-mail em contato@eventeia.com.br",
    "Posso te ligar amanhã?",
    "Nosso telefone é +55 12 98888 7777",
    "Fala comigo no Telegram",
    "Chama a gente em wa.me/5512999998888",
  ])("guarda troca oferta de outro canal: %s", (text) => {
    expect(offersOffChannel(text)).toBe(true);
    expect(enforceSocialOnlyReply(text)).toBe(CHANNEL_POLICY_REPLY);
  });

  it.each([
    "Qual o valor para 80 convidados?",
    "Perfeito, o orçamento fica R$ 12.000,00 com prazo de 15 dias.",
    "Entendo que prefere pelo WhatsApp, mas a gente atende só por aqui, no Instagram e no Messenger. Qual o valor do serviço?",
    "Não usamos telefone, só as redes sociais. Pode mandar o valor por aqui?",
    "Vocês ligam o som às 20h? E qual o valor?",
    "O valor inclui carregador de celular para os convidados?",
  ])("guarda preserva resposta sem oferta (sem falso positivo): %s", (text) => {
    expect(offersOffChannel(text)).toBe(false);
    expect(enforceSocialOnlyReply(text)).toBe(text);
  });

  it("guarda aplicada no caminho do agente e da triagem", () => {
    expect(parseAgentReply('{"reply":"Me chama no whatsapp 12999998888"}')?.reply).toBe(
      CHANNEL_POLICY_REPLY,
    );
    expect(sanitizeSupplierReply("Manda no email fulano@x.com")).toBe(CHANNEL_POLICY_REPLY);
  });
});

describe("identidade, tom e fatos", () => {
  it("identidade: voz da empresa, 'somos a EventeIA' só na 1ª resposta, honestidade se perguntado", () => {
    expect(IDENTITY_POLICY_PROMPT).toMatch(/serviço de prospecção autônomo/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/primeira pessoa do plural/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(
      /"somos a EventeIA" SOMENTE na primeira resposta da conversa ou quando perguntarem quem somos/,
    );
    expect(IDENTITY_POLICY_PROMPT).toMatch(
      /Nunca mencione nem sugira por conta própria que é uma IA/,
    );
    expect(IDENTITY_POLICY_PROMPT).toMatch(/nunca diga que é humano/);
    expect(IDENTITY_POLICY_PROMPT).toMatch(/sistema de prospecção da EventeIA/);
  });

  it("tom: no máximo 2 frases / ~250 caracteres, sem repetir contexto", () => {
    expect(CONVERSATION_TONE_PROMPT).toMatch(/no máximo 2 frases \(cerca de 250 caracteres\)/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(/fora do roteiro/);
    expect(CONVERSATION_TONE_PROMPT).toMatch(
      /Não repita cidade, número de convidados ou categoria/,
    );
  });

  it("fatos: sem custo, quem paga, canais, retorno, privacidade, 'não sei'; sem CNPJ", () => {
    expect(COMPANY_FACTS_PROMPT).toMatch(/nenhum custo para o fornecedor/);
    expect(COMPANY_FACTS_PROMPT).toMatch(
      /quem organiza o evento é quem usa a EventeIA para cotar e comparar/,
    );
    expect(COMPANY_FACTS_PROMPT).toMatch(/@eventeia/);
    expect(COMPANY_FACTS_PROMPT).toMatch(/eventeia\.com\.br/);
    expect(COMPANY_FACTS_PROMPT).toMatch(/sempre damos retorno/);
    expect(COMPANY_FACTS_PROMPT).toMatch(
      /nunca compartilhe nome, contato ou qualquer dado do cliente/,
    );
    expect(COMPANY_FACTS_PROMPT).toMatch(/Se não souber algo, diga que não sabe/);
    expect(COMPANY_FACTS_PROMPT).not.toMatch(/CNPJ/);
  });

  it('abertura e autoidentificação contêm literalmente "somos a EventeIA"', () => {
    for (const text of [PRIVATE_REPLY_OPENER, IDENTITY_PHRASE]) {
      expect(text.toLowerCase()).toContain("somos a eventeia");
    }
    expect(offersOffChannel(PRIVATE_REPLY_OPENER)).toBe(false);
  });
});
