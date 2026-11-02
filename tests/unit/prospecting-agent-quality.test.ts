import { describe, expect, it } from "vitest";

import {
  buildAgentMessages,
  buildSystemPrompt,
  normalizeReferrals,
  parseAgentReply,
} from "@/lib/prospecting/agent";
import { coerceStructuredQuote } from "@/lib/prospecting/quote";
import { applyAgentReply, type RespondPorts } from "@/lib/prospecting/respond";
import { toEventPromptContext } from "@/lib/jobs/prospect-reply";

const base = { category: "bar de drinks" };

describe("regressão: cotação com volume/moq em texto (R$ 3.800)", () => {
  const raw = JSON.stringify({
    reply:
      "Perfeito, anotado: R$ 3.800 para 60 pessoas, open bar 5h com 2 bartenders. Qual a forma de pagamento?",
    quote: {
      product: "Open bar 5h com 2 bartenders",
      specifications: "drinks clássicos e caipis",
      volume: "60 pessoas",
      moq: "60",
      priceCents: 380000,
      deadlineDays: null,
      shippingCents: "a combinar",
      paymentTerms: null,
      validUntil: null,
    },
  });

  it("não descarta a resposta e converte os números em texto", () => {
    const reply = parseAgentReply(raw);
    expect(reply).not.toBeNull();
    expect(reply?.quote).toMatchObject({
      product: "Open bar 5h com 2 bartenders",
      volume: 60,
      moq: 60,
      priceCents: 380000,
    });
    expect(reply?.quote?.shippingCents).toBeNull();
  });

  it("campo opcional inválido vira null; sem product → quote null mas reply mantida", () => {
    expect(coerceStructuredQuote({ product: "x", volume: -5, priceCents: "abc" })).toMatchObject({
      volume: null,
      priceCents: null,
    });
    const r = parseAgentReply(
      JSON.stringify({ reply: "ok, qual o valor?", quote: { volume: "60" } }),
    );
    expect(r?.reply).toBe("ok, qual o valor?");
    expect(r?.quote).toBeNull();
    expect(
      coerceStructuredQuote({
        product: "Buffet",
        volume: "1.200 convidados",
        priceCents: "380000",
      }),
    ).toMatchObject({
      volume: 1200,
      priceCents: 380000,
    });
  });

  it("booleans inválidos não derrubam a resposta", () => {
    expect(parseAgentReply('{"reply":"oi","done":"sim"}')?.done).toBe(false);
  });
});

describe("resposta em texto puro (sem JSON)", () => {
  it("vira resposta simples, com guarda de canal", () => {
    expect(
      parseAgentReply("Por aqui é só Instagram e Messenger, tá? Qual o valor do serviço?")?.reply,
    ).toBe("Por aqui é só Instagram e Messenger, tá? Qual o valor do serviço?");
    expect(parseAgentReply("Me chama no (12) 99123-4567")?.reply).not.toContain("99123");
    expect(parseAgentReply("")).toBeNull();
  });
});

describe("primeira resposta x demais", () => {
  it("isFirstReply é derivado do histórico e vai para o prompt", () => {
    const first = buildAgentMessages(base, [{ role: "user", content: "oi" }])[0]?.content ?? "";
    expect(first).toMatch(/PRIMEIRA resposta/);
    expect(first).toMatch(/já pergunte o valor/);
    const later =
      buildAgentMessages(base, [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Oi! Somos a EventeIA..." },
        { role: "user", content: "e aí" },
      ])[0]?.content ?? "";
    expect(later).toMatch(/NÃO é a primeira resposta/);
    expect(later).not.toMatch(/PRIMEIRA resposta/);
  });

  it("pede preço primeiro e depois uma pergunta por vez", () => {
    expect(buildSystemPrompt(base)).toMatch(
      /Primeiro peça o preço; depois colete, UMA pergunta por vez/,
    );
  });
});

describe("contexto do evento completo e sem invenção", () => {
  it("inclui data, tipo, cidade, convidados e categoria corretos", () => {
    const prompt = buildSystemPrompt({
      category: "bar de drinks",
      eventType: "casamento",
      eventDateIso: "2027-05-15",
      city: "São José dos Campos/SP",
      guestCount: 60,
    });
    expect(prompt).toMatch(/categoria cotada: bar de drinks/);
    expect(prompt).toMatch(/data: 15\/05\/2027/);
    expect(prompt).toMatch(/o que não estiver aqui você não sabe/);
  });

  it("toEventPromptContext omite campos vazios", () => {
    expect(
      toEventPromptContext({
        title: "Casamento A&B",
        event_type: "casamento",
        event_date: "2027-05-15",
        city: "SJC",
        city_uf: "SP",
        guest_count: 60,
      }),
    ).toEqual({
      eventTitle: "Casamento A&B",
      eventType: "casamento",
      eventDateIso: "2027-05-15",
      city: "SJC/SP",
      guestCount: 60,
    });
    expect(toEventPromptContext(null)).toEqual({});
    expect(
      toEventPromptContext({
        title: null,
        event_type: null,
        event_date: null,
        city: null,
        city_uf: null,
        guest_count: null,
      }),
    ).toEqual({});
  });
});

describe("indicações (referrals)", () => {
  it("prompt pede o @ do indicado", () => {
    expect(buildSystemPrompt(base)).toMatch(/peça o @ do Instagram dele/);
  });

  it("normaliza @ e repassa ao port saveReferrals", async () => {
    expect(
      normalizeReferrals(["@Confeitaria.Doce", "confeitaria.doce", "x", 3, "@foto_sjc"]),
    ).toEqual(["confeitaria.doce", "foto_sjc"]);
    const reply = parseAgentReply('{"reply":"Valeu! Vou chamar.","referrals":["@foto_sjc"]}');
    const saved: string[][] = [];
    const ports: RespondPorts = {
      sendReply: async () => true,
      saveQuote: async () => undefined,
      markOptOut: async () => undefined,
      escalate: async () => undefined,
      saveReferrals: async (_c, handles) => {
        saved.push([...handles]);
      },
    };
    await applyAgentReply(ports, { conversationId: "c1", supplierId: null, reply: reply! });
    expect(saved).toEqual([["foto_sjc"]]);
  });
});
