import { sceneDirective, sceneRecipe } from "./scene-rules";
import type { MarketingTheme } from "./themes";

/**
 * Prompt de imagem para o FLUX (diffusor de imagem) — puro e determinístico.
 * Gera APENAS a CENA (sem banner, sem cards, sem texto): o texto do anúncio
 * (título e "Orçamento recebido") é sobreposto DEPOIS pelo sharp em
 * `lib/marketing/card-overlay.ts`. Renderizar texto na IA causava HTTP 500 em
 * prompts complexos e rate limits — por isso o FLUX faz só a cena e o sharp faz
 * todo o texto (nítido, sem "texto atrás de texto").
 *
 * Dois variantes determinísticos (o dono quer variedade, não só card):
 * - `cards`: cena lifestyle (pessoa + smartphone + decoração do evento);
 * - `emotional`: cena emocional pura (posts de vínculo afetivo).
 *
 * Mesma entrada → mesma saída.
 */

export type MarketingPromptVariant = "cards" | "emotional";

export interface MarketingImagePromptOptions {
  /** true = enquadramento vertical 9:16 (1080×1920); false = quadrado (1080×1080). */
  vertical?: boolean;
  /** Variante da cena. Default `cards`. */
  variant?: MarketingPromptVariant;
  /** Índice do post na sequência. Elencos consecutivos não se repetem. */
  castIndex?: number;
}

/** Cenário parado (lugar, mesa, flores, comida) por tema — variante `cards`. */
const SCENE_BY_THEME: Record<string, string> = {
  infantil:
    "a Brazilian home celebration at rest, pastel pink and blush balloons, floral arrangements and a small cake stand on the table",
  aniversario:
    "a cozy Brazilian party table at rest, colorful balloons, a decorated birthday cake and warm festive decor",
  casamento:
    "a luxurious Brazilian event hall, decorated banquet tables, elegant white, cream and deep burgundy floral arrangements, glass goblets and candles",
  "15-anos":
    "a glamorous Brazilian ballroom, a decorated main table, rosé flowers and soft still lighting",
  formatura:
    "a Brazilian celebration hall, themed decor, a cap and diploma resting on the table, festive lighting",
  corporativo:
    "a modern Brazilian event space, a still stage, scenic lighting and a sleek registration area",
};

const DEFAULT_SCENE = SCENE_BY_THEME.infantil;

/** Cena emocional parada por tema — variante `emotional` (sem cards, sem texto). */
const EMOTIONAL_SCENE_BY_THEME: Record<string, string> = {
  infantil: "a still birthday cake with steady candles on a quiet table indoors in Brazil",
  aniversario: "a birthday cake waiting on a quiet table, candles steady, warm candlelight",
  casamento: "a dressed wedding table under warm string lights, chairs still, guests out of frame",
  "15-anos": "a ballroom table dressed in rosé, warm spotlights, chairs still",
  formatura: "caps and gowns folded on a table, confetti already settled, a quiet celebration hall",
  corporativo: "a quiet meeting table in a modern event space, chairs aligned, glasses still",
};

/** Pessoas paradas, só quando o índice pede elenco. */
const STILL_PEOPLE_BY_THEME: Record<string, string> = {
  infantil: "three young children seated still beside the birthday cake",
  aniversario: "one person seated still, about to make a wish, not moving",
  casamento: "a bride and groom seated still",
  "15-anos": "a debutante standing still beside the table",
  formatura: "graduates in caps and gowns standing still",
  corporativo: "a team seated still around the table",
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

/**
 * Proíbe a IA de desenhar qualquer texto/logo/UI na cena — o texto entra via
 * sharp depois (banner + cards). É a instrução que elimina o "texto atrás de
 * texto" e o HTTP 500 dos prompts com texto literal.
 */
const NO_TEXT =
  "No text, no words, no letters, no logos, no watermarks, no typography, no UI elements.";

export function buildMarketingImagePrompt(
  theme: MarketingTheme,
  opts: MarketingImagePromptOptions = {},
): string {
  const composition = compositionFor(opts.vertical === true);
  const castIndex = opts.castIndex ?? 0;
  const directive = sceneDirective(castIndex);

  if (opts.variant === "emotional") {
    const scene = EMOTIONAL_SCENE_BY_THEME[theme.key] ?? DEFAULT_EMOTIONAL_SCENE;
    const people = sceneRecipe(castIndex).includePeople
      ? (STILL_PEOPLE_BY_THEME[theme.key] ?? STILL_PEOPLE_BY_THEME.infantil)
      : "";
    return [`${scene}.`, people, directive, NO_TEXT, EMOTIONAL_STYLE, `${composition}.`]
      .filter((part) => part.length > 0)
      .join(" ");
  }

  const scene = SCENE_BY_THEME[theme.key] ?? DEFAULT_SCENE;
  const palette = PALETTE_BY_THEME[theme.key] ?? DEFAULT_PALETTE;
  return [
    "A high-end commercial lifestyle photograph for a modern AI event planning service.",
    `${scene}.`,
    directive,
    "Warm, sophisticated, cozy, minimalist mood, soft lighting, photorealistic, high-end advertising photography.",
    `${palette}.`,
    NO_TEXT,
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
