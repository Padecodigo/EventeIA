import { describe, expect, it } from "vitest";

import type { AgentReply } from "@/lib/prospecting/agent";
import type { HandleInboundResult } from "@/lib/prospecting/inbound";
import type { StructuredQuote } from "@/lib/prospecting/quote";
import {
  applyAgentReply,
  respondToInbound,
  shouldAgentRespond,
  type RespondPorts,
} from "@/lib/prospecting/respond";
import type { DeepSeekClient } from "@/lib/deepseek/client";

const emptyQuote: StructuredQuote = {
  product: "buffet",
  specifications: null,
  volume: null,
  moq: null,
  priceCents: 250000,
  deadlineDays: 10,
  shippingCents: null,
  paymentTerms: null,
  validUntil: null,
};

function fakePorts(sendOk = true): RespondPorts & {
  replies: string[];
  quotes: StructuredQuote[];
  optOuts: number;
  escalations: string[];
} {
  const replies: string[] = [];
  const quotes: StructuredQuote[] = [];
  const escalations: string[] = [];
  let optOuts = 0;
  return {
    replies,
    quotes,
    escalations,
    get optOuts() {
      return optOuts;
    },
    async sendReply(_id, text) {
      replies.push(text);
      return sendOk;
    },
    async saveQuote(_c, _s, quote) {
      quotes.push(quote);
    },
    async markOptOut() {
      optOuts += 1;
    },
    async escalate(_c, reason) {
      escalations.push(reason);
    },
  };
}

const base: AgentReply = { reply: "oi", quote: null, escalate: false, done: false, optOut: false };
const ids = { conversationId: "c1", supplierId: "s1" };

describe("aplicação da resposta do agente", () => {
  it("opt-out do LLM NÃO desinscreve: escala e não responde", async () => {
    const ports = fakePorts();
    const result = await applyAgentReply(ports, { ...ids, reply: { ...base, optOut: true } });
    expect(result).toEqual({ action: "escalated", sent: false });
    expect(ports.optOuts).toBe(0);
    expect(ports.escalations).toEqual(["possível opt-out sinalizado pela IA — revisar"]);
    expect(ports.replies).toHaveLength(0);
  });

  it("salva a cotação e responde", async () => {
    const ports = fakePorts();
    const result = await applyAgentReply(ports, { ...ids, reply: { ...base, quote: emptyQuote } });
    expect(result.action).toBe("quoted");
    expect(ports.quotes).toEqual([emptyQuote]);
    expect(ports.replies).toHaveLength(1);
  });

  it("escala ao humano e responde", async () => {
    const ports = fakePorts();
    const result = await applyAgentReply(ports, { ...ids, reply: { ...base, quote: emptyQuote, escalate: true } });
    expect(result.action).toBe("escalated");
    expect(ports.escalations).toHaveLength(1);
    expect(ports.replies).toHaveLength(1);
  });

  it("conclusão sem cotação responde e finaliza", async () => {
    const ports = fakePorts();
    const result = await applyAgentReply(ports, { ...ids, reply: { ...base, done: true } });
    expect(result.action).toBe("done");
  });

  it("resposta comum sem cotação", async () => {
    const ports = fakePorts();
    const result = await applyAgentReply(ports, { ...ids, reply: base });
    expect(result.action).toBe("replied");
    expect(ports.replies).toHaveLength(1);
  });

  it("falha de envio reflete sent:false", async () => {
    const ports = fakePorts(false);
    const result = await applyAgentReply(ports, { ...ids, reply: base });
    expect(result).toEqual({ action: "replied", sent: false });
  });

  it("cotação acima do teto de preço escala mesmo com done=true", async () => {
    const ports = fakePorts();
    const over: AgentReply = { ...base, quote: { ...emptyQuote, priceCents: 400000 }, done: true };
    const result = await applyAgentReply(ports, { ...ids, reply: over, maxPriceCents: 300000 });
    expect(result).toEqual({ action: "escalated", sent: false });
    expect(ports.escalations).toEqual(["preço R$ 4000,00 acima do teto R$ 3000,00"]);
    expect(ports.quotes).toHaveLength(0);
    expect(ports.replies).toHaveLength(0);
  });

  it("prazo acima do teto escala com reason real", async () => {
    const ports = fakePorts();
    const over: AgentReply = { ...base, quote: { ...emptyQuote, deadlineDays: 30 } };
    const result = await applyAgentReply(ports, { ...ids, reply: over, maxDeadlineDays: 15 });
    expect(result).toEqual({ action: "escalated", sent: false });
    expect(ports.escalations).toEqual(["prazo 30 dias acima de 15 dias"]);
  });

  it("cotação sem preço com teto definido escala (preço nulo)", async () => {
    const ports = fakePorts();
    const over: AgentReply = { ...base, quote: { ...emptyQuote, priceCents: null } };
    const result = await applyAgentReply(ports, { ...ids, reply: over, maxPriceCents: 300000 });
    expect(result.action).toBe("escalated");
    expect(ports.escalations[0]).toContain("sem preço");
  });

  it("cotação dentro do teto não escala", async () => {
    const ports = fakePorts();
    const ok: AgentReply = { ...base, quote: emptyQuote };
    const result = await applyAgentReply(ports, { ...ids, reply: ok, maxPriceCents: 300000, maxDeadlineDays: 15 });
    expect(result.action).toBe("quoted");
    expect(ports.escalations).toHaveLength(0);
  });
});

describe("shouldAgentRespond", () => {
  const conversation = (status: HandleInboundResult["conversation"]["status"]) => ({ id: "c1", status });

  it("normal: conversa aberta gravada responde", () => {
    const outcome: HandleInboundResult = {
      action: { action: "open_conversation", messageId: "m1" },
      conversation: conversation("awaiting_human"),
      recorded: true,
    };
    expect(shouldAgentRespond(outcome)).toBe(true);
  });

  it("opt_out action: não responde", () => {
    const outcome: HandleInboundResult = {
      action: { action: "opt_out" },
      conversation: conversation("opted_out"),
      recorded: true,
    };
    expect(shouldAgentRespond(outcome)).toBe(false);
  });

  it("conversa opted_out com texto normal: não responde", () => {
    const outcome: HandleInboundResult = {
      action: { action: "open_conversation", messageId: "m1" },
      conversation: conversation("opted_out"),
      recorded: true,
    };
    expect(shouldAgentRespond(outcome)).toBe(false);
  });

  it("replay idempotente (recorded=false): não responde", () => {
    const outcome: HandleInboundResult = {
      action: { action: "open_conversation", messageId: "m1" },
      conversation: conversation("awaiting_human"),
      recorded: false,
    };
    expect(shouldAgentRespond(outcome)).toBe(false);
  });
});

describe("respondToInbound", () => {
  it("roda o agente e aplica", async () => {
    const client: DeepSeekClient = {
      mode: "mock",
      complete: () =>
        Promise.resolve(JSON.stringify({ reply: "Anotado!", quote: emptyQuote, escalate: false, done: false, opt_out: false })),
    };
    const ports = fakePorts();
    const result = await respondToInbound({
      client,
      context: { category: "buffet" },
      history: [{ role: "user", content: "buffet 100 pessoas, R$ 2.500, prazo 10 dias" }],
      ports,
      ...ids,
    });
    expect(result?.action).toBe("quoted");
  });

  it("devolve escalated quando o agente responde inválido", async () => {
    const client: DeepSeekClient = { mode: "mock", complete: () => Promise.resolve("lixo") };
    const ports = fakePorts();
    const result = await respondToInbound({
      client,
      context: { category: "buffet" },
      history: [],
      ports,
      ...ids,
    });
    expect(result).toEqual({ action: "escalated", sent: false });
    expect(ports.escalations).toEqual(["saída inválida da IA"]);
  });
});
