import type { MarketingTheme } from "./themes";

/**
 * Prompt de imagem para o FLUX (diffusor de imagem) — puro e determinístico.
 * Descreve uma cena realista e profissional para o tema, sem texto, logotipos,
 * marcas d'água nem pessoas identificáveis. Mesma entrada → mesma saída.
 */

export interface MarketingImagePromptOptions {
  /** true = enquadramento vertical 9:16 (1080×1920); false = quadrado (1080×1080). */
  vertical?: boolean;
}

/** Cena por tema (chave de `MARKETING_THEMES`). Determinística, sem sorteio. */
const SCENE_BY_THEME: Record<string, string> = {
  infantil:
    "festa infantil em um jardim ao ar livre, mesa de doces colorida com bolo, balões e decoração alegre em tons pastel, luz natural suave",
  aniversario:
    "festa de aniversário acolhedora, mesa decorada com bolo, flores e balões, iluminação quente e ambiente festivo",
  casamento:
    "recepção de casamento sofisticada, mesa de convidados com arranjos florais, velas e taças, luz dourada de fim de tarde",
  "15-anos":
    "festa de quinze anos requintada, salão com iluminação suave, mesa principal decorada e arranjos de flores em tons rosé",
  formatura:
    "festa de formatura, salão com decoração temática, capelo e diploma sobre a mesa, balões e confete, clima de conquista",
  corporativo:
    "evento corporativo moderno, auditório com palco e iluminação cênica, mesa de credenciamento e ambiente profissional",
};

const DEFAULT_SCENE = SCENE_BY_THEME.infantil;

export function buildMarketingImagePrompt(
  theme: MarketingTheme,
  opts: MarketingImagePromptOptions = {},
): string {
  const framing =
    opts.vertical === true ? "enquadramento vertical 9:16" : "enquadramento quadrado 1:1";
  const scene = SCENE_BY_THEME[theme.key] ?? DEFAULT_SCENE;
  return [
    "Fotografia editorial realista e sofisticada, iluminação natural quente, cores suaves, composição limpa, aparência de foto profissional real (não ilustração, não desenho, não CGI), alta resolução.",
    `Cena: ${scene}.`,
    framing,
    "Sem texto, sem logotipos, sem marcas d'água e sem pessoas identificáveis.",
  ].join(" ");
}
