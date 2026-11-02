import { describe, expect, it } from "vitest";

import { CHANNEL_POLICY_REPLY } from "@/lib/ai/channel-policy";
import type { DeepSeekClient } from "@/lib/deepseek/client";
import { respondToInbound, type RespondPorts } from "@/lib/prospecting/respond";

function mockClient(raw: string, seen: { system?: string }): DeepSeekClient {
  return {
    complete: ({ messages }: { messages: { role: string; content: string }[] }) => {
      seen.system = messages.find((m) => m.role === "system")?.content;
      return Promise.resolve(raw);
    },
  } as unknown as DeepSeekClient;
}

function ports() {
  const state = {
    sent: [] as string[],
    quotes: [] as unknown[],
    escalations: [] as string[],
    referrals: [] as string[][],
  };
  const p: RespondPorts = {
    sendReply: (_c, text) => {
      state.sent.push(text);
      return Promise.resolve(true);
    },
    saveQuote: (_c, _s, quote) => {
      state.quotes.push(quote);
      return Promise.resolve();
    },
    markOptOut: () => Promise.resolve(),
    escalate: (_c, reason) => {
      state.escalations.push(reason);
      return Promise.resolve();
    },
    saveReferrals: (_c, handles) => {
      state.referrals.push([...handles]);
      return Promise.resolve();
    },
  };
  return { p, state };
}

const context = {
  category: "bar de drinks",
  eventType: "casamento",
  eventDateIso: "2027-05-15",
  city: "São José dos Campos/SP",
  guestCount: 60,
  maxPriceCents: 500000,
};

describe("integração: respondToInbound com modelo mockado", () => {
  it("regressão R$ 3.800: volume em texto salva a cotação e envia a resposta (não escala)", async () => {
    const seen: { system?: string } = {};
    const { p, state } = ports();
    const raw = JSON.stringify({
      reply: "Anotado, R$ 3.800 para 60 pessoas. Qual a forma de pagamento?",
      quote: {
        product: "Open bar 5h",
        specifications: null,
        volume: "60 pessoas",
        moq: null,
        priceCents: 380000,
        deadlineDays: null,
        shippingCents: null,
        paymentTerms: null,
        validUntil: null,
      },
    });
    const result = await respondToInbound({
      client: mockClient(raw, seen),
      context,
      history: [
        { role: "user", content: "COTAÇÃO" },
        { role: "assistant", content: "Oi! Somos a EventeIA… qual o valor?" },
        { role: "user", content: "Pra 60 pessoas fica R$ 3.800, open bar 5h com 2 bartenders." },
      ],
      ports: p,
      conversationId: "c1",
      supplierId: "s1",
    });
    expect(result.action).toBe("quoted");
    expect(state.escalations).toEqual([]);
    expect(state.quotes[0]).toMatchObject({ volume: 60, priceCents: 380000 });
    expect(seen.system).toMatch(/data: 15\/05\/2027/);
    expect(seen.system).toMatch(/NÃO é a primeira resposta/);
  });

  it("indicação: @ vai para saveReferrals e a resposta é enviada", async () => {
    const { p, state } = ports();
    await respondToInbound({
      client: mockClient(
        '{"reply":"Valeu pela indicação! Qual o @ dela?","referrals":["@confeitaria.doce"]}',
        {},
      ),
      context,
      history: [{ role: "user", content: "Não faço drinks, mas conheço a @confeitaria.doce" }],
      ports: p,
      conversationId: "c2",
      supplierId: null,
    });
    expect(state.referrals).toEqual([["confeitaria.doce"]]);
    expect(state.sent).toHaveLength(1);
  });

  it("recusa natural do modelo é preservada; oferta de número cai no fallback", async () => {
    const natural =
      "Entendo! Mas a gente atende só por aqui, no Instagram e no Messenger. Qual o valor do serviço?";
    const a = ports();
    await respondToInbound({
      client: mockClient(JSON.stringify({ reply: natural }), {}),
      context,
      history: [{ role: "user", content: "tem whats?" }],
      ports: a.p,
      conversationId: "c3",
      supplierId: null,
    });
    expect(a.state.sent).toEqual([natural]);
    const b = ports();
    await respondToInbound({
      client: mockClient('{"reply":"Me chama no (12) 99123-4567"}', {}),
      context,
      history: [{ role: "user", content: "tem whats?" }],
      ports: b.p,
      conversationId: "c4",
      supplierId: null,
    });
    expect(b.state.sent).toEqual([CHANNEL_POLICY_REPLY]);
  });
});
