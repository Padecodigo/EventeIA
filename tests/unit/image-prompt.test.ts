import { describe, expect, it } from "vitest";

import { buildMarketingImagePrompt } from "@/lib/marketing/image-prompt";
import { MARKETING_THEMES, type MarketingTheme } from "@/lib/marketing/themes";

const theme = (key: string): MarketingTheme =>
  MARKETING_THEMES.find((t) => t.key === key) ?? MARKETING_THEMES[0];

describe("prompt de imagem do FLUX", () => {
  it("é determinístico: mesma entrada produz a mesma saída", () => {
    const infantil = theme("infantil");
    expect(buildMarketingImagePrompt(infantil)).toBe(buildMarketingImagePrompt(infantil));
  });

  it("usa enquadramento quadrado por padrão e vertical quando pedido", () => {
    const infantil = theme("infantil");
    expect(buildMarketingImagePrompt(infantil)).toContain("enquadramento quadrado 1:1");
    expect(buildMarketingImagePrompt(infantil, { vertical: true })).toContain(
      "enquadramento vertical 9:16",
    );
  });

  it("descreve uma cena específica do tema", () => {
    expect(buildMarketingImagePrompt(theme("infantil"))).toContain("festa infantil");
    expect(buildMarketingImagePrompt(theme("casamento"))).toContain("casamento");
    expect(buildMarketingImagePrompt(theme("corporativo"))).toContain("corporativo");
  });

  it("proíbe texto, logotipos, marcas d'água e pessoas identificáveis", () => {
    const prompt = buildMarketingImagePrompt(theme("formatura"));
    expect(prompt).toContain("Sem texto");
    expect(prompt).toContain("sem logotipos");
    expect(prompt).toContain("sem marcas d'água");
    expect(prompt).toContain("sem pessoas identificáveis");
  });

  it("mira a estética editorial elogiada (foto real, não CGI/ilustração)", () => {
    const prompt = buildMarketingImagePrompt(theme("casamento"));
    expect(prompt).toContain("editorial realista e sofisticada");
    expect(prompt).toContain("iluminação natural quente");
    expect(prompt).toContain("aparência de foto profissional real");
    expect(prompt).toContain("não ilustração");
    expect(prompt).toContain("não desenho");
    expect(prompt).toContain("não CGI");
  });

  it("distingue temas diferentes", () => {
    expect(buildMarketingImagePrompt(theme("infantil"))).not.toBe(
      buildMarketingImagePrompt(theme("corporativo")),
    );
  });
});
