import { describe, expect, it } from "vitest";

import { CATEGORY_LABELS } from "@/lib/catalog/v1";
import type { DeepSeekClient } from "@/lib/deepseek/client";
import { buildSystemPrompt, type AgentMessage } from "@/lib/prospecting/agent";
import { emptyOutputFallback } from "@/lib/prospecting/agent-runtime";
import type { StructuredQuote } from "@/lib/prospecting/quote";
import {
  detectPrice,
  mentionedOtherService,
  spokenCategoryLabel,
} from "@/lib/prospecting/reply-guard";
import { respondToInbound, type RespondPorts } from "@/lib/prospecting/respond";

function ports() {
  const replies: string[] = [];
  const quotes: StructuredQuote[] = [];
  const escalations: string[] = [];
  const p: RespondPorts = {
    sendReply: (_c, text) => {
      replies.push(text);
      return Promise.resolve(true);
    },
    saveQuote: (_c, _s, q) => {
      quotes.push(q);
      return Promise.resolve();
    },
    markOptOut: () => Promise.resolve(),
    escalate: (_c, reason) => {
      escalations.push(reason);
      return Promise.resolve();
    },
  };
  return { p, replies, quotes, escalations };
}

function client(...outputs: string[]): DeepSeekClient {
  let i = 0;
  return {
    complete: () => Promise.resolve(outputs[Math.min(i++, outputs.length - 1)] ?? ""),
  } as unknown as DeepSeekClient;
}

const ASK = "Pode ser por aqui mesmo, tá? Me manda o valor que você cobra pelo serviço de som/DJ.";

async function run(history: AgentMessage[], ...outputs: string[]) {
  const s = ports();
  const result = await respondToInbound({
    client: client(...outputs),
    context: { category: "som_dj" },
    history,
    ports: s.p,
    conversationId: "c1",
    supplierId: "be6a5c38",
  });
  return { ...s, result };
}

describe("(a) rótulo natural da categoria", () => {
  it("fallback usa som/DJ, nunca som_dj", () => {
    const text = emptyOutputFallback({ category: "som_dj" }).reply;
    expect(text).toContain("som/DJ");
    expect(text).not.toMatch(/_/);
  });
  it("todas as categorias têm rótulo falado sem underline", () => {
    for (const code of Object.keys(CATEGORY_LABELS)) {
      expect(spokenCategoryLabel(code)).not.toMatch(/_/);
    }
    expect(spokenCategoryLabel("categoria_nova")).toBe("categoria nova");
  });
  it("prompt descreve a categoria pelo rótulo natural", () => {
    const prompt = buildSystemPrompt({ category: "som_dj" });
    expect(prompt).toContain("categoria cotada: som/DJ");
    expect(prompt).not.toContain("som_dj");
  });
});

describe("(b) preço já enviado vira cotação e agradecimento", () => {
  const history: AgentMessage[] = [
    { role: "user", content: "oi" },
    { role: "assistant", content: ASK },
    { role: "user", content: "R$ 3.500 para 30 pessoas, buffet completo" },
  ];

  it("detecta valor e volume", () => {
    expect(detectPrice("R$ 3.500 para 30 pessoas, buffet completo")).toMatchObject({
      cents: 350000,
      volume: 30,
      perPerson: false,
    });
    expect(detectPrice("cobro 2500 reais")?.cents).toBe(250000);
    expect(detectPrice("R$ 85 por pessoa")).toMatchObject({ cents: 8500, perPerson: true });
    expect(detectPrice("tudo bem?")).toBeNull();
  });

  it("modelo vazio (fallback) não re-pede o valor: salva cotação e agradece", async () => {
    const r = await run(history, "", "");
    expect(r.quotes).toHaveLength(1);
    expect(r.quotes[0]).toMatchObject({ priceCents: 350000, volume: 30 });
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0]).not.toMatch(/me manda o valor/i);
    expect(r.replies[0]).toMatch(/anotei/i);
    expect(r.result.action).toBe("quoted");
  });

  it("modelo que re-pede o preço sem cotação é corrigido", async () => {
    const r = await run(
      history,
      JSON.stringify({ reply: "Qual o valor do serviço?", quote: null }),
    );
    expect(r.quotes).toHaveLength(1);
    expect(r.replies[0]).toMatch(/obrigad/i);
  });

  it("saída inválida do modelo com preço na mensagem ainda registra a cotação", async () => {
    const r = await run(history, "{quebrado");
    expect(r.quotes).toHaveLength(1);
    expect(r.escalations).toHaveLength(0);
  });
});

describe("(c) nunca a mesma mensagem duas vezes seguidas", () => {
  it("reformula quando o modelo repete a resposta anterior", async () => {
    const history: AgentMessage[] = [
      { role: "user", content: "oi" },
      { role: "assistant", content: ASK },
      { role: "user", content: "me chama no zap" },
    ];
    const r = await run(history, "", "");
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0]).not.toBe(ASK);
    expect(r.replies[0]).toContain("som/DJ");
  });

  it("não envia se até a reformulação for igual à anterior", async () => {
    const alt =
      "Sem pressa! Quando puder, me passa uma ideia de valor para som/DJ (pode ser uma faixa) que eu já repasso ao cliente.";
    const history: AgentMessage[] = [
      { role: "assistant", content: alt },
      { role: "user", content: "hmm" },
    ];
    const r = await run(history, JSON.stringify({ reply: alt }));
    // a reformulação de `alt` (que pede valor) é ela mesma → não reenvia.
    expect(r.replies).toHaveLength(0);
    expect(r.result.sent).toBe(false);
  });
});

describe("(d) reconhece o serviço que o fornecedor diz oferecer", () => {
  it("cadastrado como DJ, fala buffet → reconhece buffet", async () => {
    expect(mentionedOtherService("buffet completo", "som_dj")).toBe("buffet");
    expect(mentionedOtherService("faço DJ e som", "som_dj")).toBeNull();
    const r = await run(
      [
        { role: "assistant", content: ASK },
        { role: "user", content: "R$ 3.500 para 30 pessoas, buffet completo" },
      ],
      "",
      "",
    );
    expect(r.replies[0]).toMatch(/trabalham com buffet/);
    expect(r.replies[0]).not.toMatch(/assistente virtual|\bIA\b|whatsapp|1\)|menu/i);
  });
  it("prompt pede para reconhecer o serviço citado", () => {
    expect(buildSystemPrompt({ category: "som_dj" })).toMatch(/reconheça isso com naturalidade/);
  });
});
