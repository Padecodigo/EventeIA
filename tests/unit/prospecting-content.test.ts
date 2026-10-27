import { describe, expect, it } from "vitest";

import { validateCaption } from "@/lib/meta/publishing";
import { buildCaption, buildImagePrompt, buildPostContent } from "@/lib/prospecting/content";

const base = { category: "Buffet", keyword: "cotação", handles: ["buffet_a", "foto_b"], variant: 0 };

describe("conteúdo do post de isca", () => {
  it("legenda tem CTA com a palavra-chave, menções e aviso de ilustrativa", () => {
    const caption = buildCaption(base);
    expect(caption).toContain("COTAÇÃO");
    expect(caption).toContain("@buffet_a");
    expect(caption).toContain("@foto_b");
    expect(caption).toContain("assistente virtual");
    expect(caption).toContain("Imagens ilustrativas.");
  });

  it("a legenda respeita os limites da Meta", () => {
    expect(validateCaption(buildCaption(base))).toEqual({ ok: true });
  });

  it("varia a abertura conforme o índice, mas o CTA continua", () => {
    const a = buildCaption({ ...base, variant: 0 });
    const b = buildCaption({ ...base, variant: 1 });
    expect(a).not.toBe(b);
    expect(b).toContain("COTAÇÃO");
  });

  it("prompt visual inclui categoria, cidade e convidados", () => {
    const prompt = buildImagePrompt({ category: "buffet", city: "Taubaté", guestCount: 120, variant: 0 });
    expect(prompt).toContain("buffet");
    expect(prompt).toContain("Taubaté");
    expect(prompt).toContain("120 convidados");
  });

  it("não gera menções acima do limite e mantém a legenda válida com muitas tags", () => {
    const handles = Array.from({ length: 40 }, (_, i) => `fornecedor${String(i)}`);
    const caption = buildCaption({ ...base, handles });
    expect(validateCaption(caption)).toEqual({ ok: true });
  });

  it("buildPostContent devolve prompt e legenda", () => {
    const content = buildPostContent(base);
    expect(content.imagePrompt.length).toBeGreaterThan(10);
    expect(content.caption).toContain("COTAÇÃO");
  });
});
