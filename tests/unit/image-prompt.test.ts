import { describe, expect, it } from "vitest";

import { buildMarketingImagePrompt, marketingPromptVariant } from "@/lib/marketing/image-prompt";
import { MARKETING_THEMES, type MarketingTheme } from "@/lib/marketing/themes";

const theme = (key: string): MarketingTheme =>
  MARKETING_THEMES.find((t) => t.key === key) ?? MARKETING_THEMES[0];

describe("prompt de imagem do FLUX (cena pura, sem texto)", () => {
  it("é determinístico: mesma entrada produz a mesma saída", () => {
    const infantil = theme("infantil");
    expect(buildMarketingImagePrompt(infantil)).toBe(buildMarketingImagePrompt(infantil));
    expect(buildMarketingImagePrompt(infantil, { variant: "emotional" })).toBe(
      buildMarketingImagePrompt(infantil, { variant: "emotional" }),
    );
  });

  it("usa composição quadrada por padrão e vertical quando pedido", () => {
    const infantil = theme("infantil");
    expect(buildMarketingImagePrompt(infantil)).toContain(
      "square composition for social media (1:1)",
    );
    expect(buildMarketingImagePrompt(infantil, { vertical: true })).toContain(
      "vertical composition for social media (9:16)",
    );
    expect(buildMarketingImagePrompt(infantil, { variant: "emotional", vertical: true })).toContain(
      "vertical composition for social media (9:16)",
    );
  });

  it("mira a estética de referência do variante 'cards' (cena lifestyle, sem cards)", () => {
    const prompt = buildMarketingImagePrompt(theme("infantil"));
    expect(prompt).toContain("lifestyle photograph");
    expect(prompt).toContain("photorealistic");
    expect(prompt).toContain("high-end advertising photography");
    expect(prompt).toContain("smartphone");
  });

  it("NÃO descreve banner, cards nem texto 'Orçamento recebido' (cena pura)", () => {
    const prompt = buildMarketingImagePrompt(theme("infantil"));
    expect(prompt).not.toContain("Orçamento recebido");
    expect(prompt).not.toContain("banner headline");
    expect(prompt).not.toContain("notification card");
    expect(prompt).not.toContain("checkmark");
    expect(prompt).not.toContain("A festa que ele");
    expect(prompt).toContain("No text");
  });

  it("adapta o cenário/decoração ao tema (não é uma cena genérica)", () => {
    expect(buildMarketingImagePrompt(theme("infantil"))).toContain("balloons");
    expect(buildMarketingImagePrompt(theme("casamento"))).toContain("event hall");
    expect(buildMarketingImagePrompt(theme("casamento"))).toContain("burgundy");
    expect(buildMarketingImagePrompt(theme("15-anos"))).toContain("ballroom");
    expect(buildMarketingImagePrompt(theme("formatura"))).toContain("cap");
    expect(buildMarketingImagePrompt(theme("corporativo"))).toContain("event space");
    expect(buildMarketingImagePrompt(theme("aniversario"))).toContain("birthday cake");
  });

  it("distingue temas diferentes", () => {
    expect(buildMarketingImagePrompt(theme("infantil"))).not.toBe(
      buildMarketingImagePrompt(theme("corporativo")),
    );
    expect(buildMarketingImagePrompt(theme("casamento"))).not.toBe(
      buildMarketingImagePrompt(theme("formatura")),
    );
  });

  it("todos os temas geram um prompt não vazio SEM texto de orçamento", () => {
    for (const t of MARKETING_THEMES) {
      const prompt = buildMarketingImagePrompt(t);
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).not.toContain("Orçamento recebido");
      expect(prompt).toContain("No text");
    }
  });
});

describe("variante 'emotional' (cena pura, sem cards)", () => {
  it("não tem cards nem texto de orçamento", () => {
    const prompt = buildMarketingImagePrompt(theme("infantil"), { variant: "emotional" });
    expect(prompt).not.toContain("Orçamento recebido");
    expect(prompt).not.toContain("notification card");
    expect(prompt).not.toContain("banner headline");
  });

  it("mira a estética cinematográfica/emocional de referência", () => {
    const prompt = buildMarketingImagePrompt(theme("infantil"), { variant: "emotional" });
    expect(prompt).toContain("Shallow depth of field");
    expect(prompt).toContain("cinematic lighting");
    expect(prompt).toContain("photorealistic commercial advertising");
    expect(prompt).toContain("8k");
    expect(prompt).toContain("No text");
  });

  it("adapta a cena emocional ao tema", () => {
    expect(buildMarketingImagePrompt(theme("infantil"), { variant: "emotional" })).toContain(
      "birthday cake",
    );
    expect(buildMarketingImagePrompt(theme("casamento"), { variant: "emotional" })).toContain(
      "first dance",
    );
    expect(buildMarketingImagePrompt(theme("15-anos"), { variant: "emotional" })).toContain(
      "debutante",
    );
    expect(buildMarketingImagePrompt(theme("formatura"), { variant: "emotional" })).toContain(
      "caps and gowns",
    );
    expect(buildMarketingImagePrompt(theme("corporativo"), { variant: "emotional" })).toContain(
      "team",
    );
    expect(buildMarketingImagePrompt(theme("aniversario"), { variant: "emotional" })).toContain(
      "make a wish",
    );
  });
});

describe("alternância determinística do variante", () => {
  it("alterna por slot de 4h (par = cards, ímpar = emotional)", () => {
    expect(marketingPromptVariant(0)).toBe("cards");
    expect(marketingPromptVariant(4)).toBe("emotional");
    expect(marketingPromptVariant(8)).toBe("cards");
    expect(marketingPromptVariant(12)).toBe("emotional");
    expect(marketingPromptVariant(16)).toBe("cards");
    expect(marketingPromptVariant(20)).toBe("emotional");
  });

  it("dayOffset inverte a paridade entre os dias", () => {
    expect(marketingPromptVariant(0, 0)).toBe("cards");
    expect(marketingPromptVariant(0, 1)).toBe("emotional");
    expect(marketingPromptVariant(0, 2)).toBe("cards");
  });

  it("é determinístico e lida com horas negativas", () => {
    expect(marketingPromptVariant(-4)).toBe(marketingPromptVariant(4));
    expect(marketingPromptVariant(7)).toBe(marketingPromptVariant(4));
  });
});
