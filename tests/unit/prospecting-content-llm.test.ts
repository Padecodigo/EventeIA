import { describe, expect, it } from "vitest";

import type { DeepSeekClient } from "@/lib/deepseek/client";
import { generatePlanContent, type PlanContentInput } from "@/lib/prospecting/content-llm";

const input: PlanContentInput = {
  event: { title: "Casamento Alfa", typeLabel: "Casamento", city: "Taubaté", guestCount: 120 },
  keyword: "cotação",
  posts: [
    { index: 0, category: "buffet", handles: ["buffet_a", "buffet_b"], part: 1, totalParts: 2 },
    { index: 1, category: "buffet", handles: ["buffet_c"], part: 2, totalParts: 2 },
  ],
};

function clientReturning(raw: string): DeepSeekClient {
  return { mode: "mock", complete: () => Promise.resolve(raw) };
}

describe("conteúdo gerado pela LLM", () => {
  it("usa o conteúdo da LLM quando o JSON é válido", async () => {
    const raw = JSON.stringify({
      posts: [
        { index: 0, imagePrompt: "cena de buffet elegante em Taubaté", caption: "Somos a EventeIA. Buscamos buffet. Comente COTAÇÃO. Imagens ilustrativas." },
        { index: 1, imagePrompt: "mesa de buffet em close", caption: "Somos a EventeIA. Buscamos buffet. Comente COTAÇÃO. Imagens ilustrativas." },
      ],
    });
    const out = await generatePlanContent(input, clientReturning(raw));
    expect(out[0]?.caption).toContain("Somos a EventeIA");
    expect(out[0]?.imagePrompt).toContain("buffet");
    expect(out).toHaveLength(2);
  });

  it("cai no template quando o JSON é inválido", async () => {
    const out = await generatePlanContent(input, clientReturning("não é json"));
    expect(out[0]?.caption).toContain("COTAÇÃO");
    expect(out).toHaveLength(2);
  });

  it("cai no template quando faltam índices", async () => {
    const raw = JSON.stringify({ posts: [{ index: 0, imagePrompt: "prompt válido aqui", caption: "legenda válida com COTAÇÃO aqui" }] });
    const out = await generatePlanContent(input, clientReturning(raw));
    expect(out[0]?.caption).toContain("COTAÇÃO");
    expect(out).toHaveLength(2);
  });

  it("cai no template quando o cliente lança erro", async () => {
    const failing: DeepSeekClient = { mode: "mock", complete: () => Promise.reject(new Error("offline")) };
    const out = await generatePlanContent(input, failing);
    expect(out[0]?.caption).toContain("COTAÇÃO");
  });

  it("lista vazia não chama a LLM", async () => {
    let called = false;
    const spy: DeepSeekClient = { mode: "mock", complete: () => { called = true; return Promise.resolve("{}"); } };
    expect(await generatePlanContent({ ...input, posts: [] }, spy)).toEqual([]);
    expect(called).toBe(false);
  });
});
