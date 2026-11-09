import { HEADLINES_BY_THEME } from "./card-overlay";
import type { MarketingTheme } from "./themes";

/**
 * Prompt de imagem para o FLUX (diffusor de imagem) — puro e determinístico.
 * Estilo de referência do dono (out/2026): fotografia lifestyle comercial com
 * uma pessoa consultando o celular, cenário/decoração do evento ao fundo e
 * 1–2 cards de notificação de UI flutuando sobre a cena. O texto do card vive
 * NA imagem renderizada pela IA (não é sobreposto por sharp depois), no formato
 * exato `Orçamento recebido - <categoria>`.
 *
 * Dois variantes determinísticos (o dono quer variedade, não só card):
 * - `cards`: cena lifestyle + cards de UI (posts de proposta de valor);
 * - `emotional`: cena emocional pura, sem cards (posts de vínculo afetivo).
 *
 * Mesma entrada → mesma saída.
 */

export type MarketingPromptVariant = "cards" | "emotional";

export interface MarketingImagePromptOptions {
  /** true = enquadramento vertical 9:16 (1080×1920); false = quadrado (1080×1080). */
  vertical?: boolean;
  /** Variante da cena. Default `cards`. */
  variant?: MarketingPromptVariant;
}

/** Categorias dos cards de notificação por tema (as 2 mais relevantes). */
const CARD_CATEGORIES_BY_THEME: Record<string, readonly [string, string]> = {
  infantil: ["Buffet infantil", "Decoração"],
  aniversario: ["Buffet", "Bolo"],
  casamento: ["Buffet", "Decoração"],
  "15-anos": ["Buffet", "DJ"],
  formatura: ["Espaço", "DJ"],
  corporativo: ["Coffee break", "Espaço"],
};

const DEFAULT_CATEGORIES = CARD_CATEGORIES_BY_THEME.infantil;

/** Cenário lifestyle (pessoa + decoração do evento) por tema — variante `cards`. */
const SCENE_BY_THEME: Record<string, string> = {
  infantil:
    "a smiling young woman with blonde hair sits at a table at home, happily looking down at her smartphone, in a warmly lit room with pastel pink and blush balloons, floral arrangements and a small cake stand on the table",
  aniversario:
    "a smiling young woman sits at a cozy party table looking at her smartphone, surrounded by colorful balloons, a decorated birthday cake and warm festive decor",
  casamento:
    "an elegant woman with short curly dark hair in a beige blazer stands inside a luxurious event hall looking at her smartphone, with decorated banquet tables, elegant white, cream and deep burgundy floral arrangements, glass goblets and candles in soft bokeh behind her",
  "15-anos":
    "a young woman in an elegant dress looks at her smartphone inside a glamorous ballroom with a decorated main table, rosé flowers and soft dramatic lighting",
  formatura:
    "a smiling graduate looks at her smartphone inside a celebration hall with themed decor, confetti, a cap and diploma on the table and festive lighting",
  corporativo:
    "a professional woman in business attire looks at her smartphone inside a modern event space with a stage, scenic lighting and a sleek registration area",
};

const DEFAULT_SCENE = SCENE_BY_THEME.infantil;

/** Cena emocional pura por tema — variante `emotional` (sem cards, sem texto). */
const EMOTIONAL_SCENE_BY_THEME: Record<string, string> = {
  infantil:
    "a heartwarming high-end commercial photograph of three young children around a birthday cake indoors, a cute young girl in the center blowing out the glowing candles on a frosted birthday cake while two other kids (a blonde toddler on one side and a dark-haired child on the other) watch with joy and excitement",
  aniversario:
    "a heartwarming commercial photograph of friends and family gathered around a birthday cake, the celebrant closing their eyes to make a wish before blowing the candles, warm candlelight and affectionate smiles",
  casamento:
    "a romantic high-end commercial photograph of a bride and groom sharing an emotional first dance under warm string lights, guests softly blurred in the background, tender expressions",
  "15-anos":
    "a glamorous commercial photograph of a debutante in an elegant gown dancing with her father in a decorated ballroom, both smiling with emotion under warm spotlights",
  formatura:
    "a joyful commercial photograph of graduates in caps and gowns hugging and tossing their caps in the air, confetti falling, genuine celebratory emotion",
  corporativo:
    "a candid commercial photograph of a team celebrating in a modern event space, colleagues applauding and high-fiving with genuine smiles",
};

const DEFAULT_EMOTIONAL_SCENE = EMOTIONAL_SCENE_BY_THEME.infantil;

/** Paleta/mood por tema (variante `cards`; calibrada com as referências). */
const PALETTE_BY_THEME: Record<string, string> = {
  infantil: "clean pastel palette (creams, soft whites, muted pinks)",
  aniversario: "warm cream and pastel palette",
  casamento: "elegant cream and earth palette with deep burgundy accents",
  "15-anos": "rosé and glam palette with soft gold accents",
  formatura: "warm celebratory palette",
  corporativo: "clean modern neutral palette",
};

const DEFAULT_PALETTE = PALETTE_BY_THEME.infantil;

function compositionFor(vertical: boolean): string {
  return vertical
    ? "vertical composition for social media (9:16)"
    : "square composition for social media (1:1)";
}

/** Estilo cinematográfico comum às cenas emocionais (sem cards). */
const EMOTIONAL_STYLE =
  "Shallow depth of field focusing on the emotional expressions, soft blurred background, cinematic lighting with warm candle highlights, moody dark tones contrasting warm highlights, organic candid style, 8k, photorealistic commercial advertising.";

export function buildMarketingImagePrompt(
  theme: MarketingTheme,
  opts: MarketingImagePromptOptions = {},
): string {
  const composition = compositionFor(opts.vertical === true);
  const headline = HEADLINES_BY_THEME[theme.key] ?? HEADLINES_BY_THEME.infantil;

  if (opts.variant === "emotional") {
    const scene = EMOTIONAL_SCENE_BY_THEME[theme.key] ?? DEFAULT_EMOTIONAL_SCENE;
    return [
      `${scene}.`,
      `At the top, a bold white banner headline reads '${headline[0]} ${headline[1]}'.`,
      EMOTIONAL_STYLE,
      `${composition}.`,
    ].join(" ");
  }

  const [categoryA, categoryB] = CARD_CATEGORIES_BY_THEME[theme.key] ?? DEFAULT_CATEGORIES;
  const scene = SCENE_BY_THEME[theme.key] ?? DEFAULT_SCENE;
  const palette = PALETTE_BY_THEME[theme.key] ?? DEFAULT_PALETTE;
  return [
    "A high-end commercial lifestyle photograph for a modern AI event planning service.",
    `${scene}.`,
    `At the top of the image, a bold white advertising banner headline reads '${headline[0]} ${headline[1]}'.`,
    `Floating over the scene are two modern white UI notification cards with rounded corners and a maroon checkmark icon: one reads 'Orçamento recebido - ${categoryA}' and the other reads 'Orçamento recebido - ${categoryB} · via WhatsApp'.`,
    "Warm, sophisticated, cozy, minimalist mood, soft lighting, photorealistic, high-end advertising photography.",
    `${palette}.`,
    `${composition}.`,
  ].join(" ");
}

/**
 * Alterna deterministicamente o variante conforme o slot de 4h (o mesmo slot
 * usado por `themeForHour`): slots pares → `cards`, ímpares → `emotional`.
 * `dayOffset` inverte a paridade entre os dias, dando variedade diária.
 */
export function marketingPromptVariant(hour: number, dayOffset = 0): MarketingPromptVariant {
  const slot = Math.floor(Math.abs(Math.trunc(hour)) / 4);
  return (slot + dayOffset) % 2 === 0 ? "cards" : "emotional";
}
