/**
 * Regras da cena gerada para os posts de isca.
 *
 * A cena nasce do TIPO DO EVENTO (mesa de casamento decorada, buffet
 * corporativo, bolo de festa infantil etc.), num ambiente bonito e genérico.
 * NÃO há pessoas em nenhuma cena: o lugar, a mesa, a comida e a decoração
 * carregam a imagem. O índice rotaciona ângulo e paleta para não repetir a
 * mesma composição. A mesma entrada produz a mesma descrição.
 */

const EVENT_SCENES = {
  festa_infantil:
    "a beautiful birthday table with a layered birthday cake, pastel balloons, soft floral arrangements and party favors",
  aniversario:
    "a beautiful birthday table with a birthday cake, lit candles, festive flowers and elegant tableware",
  casamento:
    "a beautifully decorated wedding table with white and burgundy flowers, candles, crystal glassware, linen and refined place settings",
  quinze_anos:
    "an elegant fifteenth-birthday ballroom with a decorated main table, a tiered cake, rosé flowers and soft golden lighting",
  batizado:
    "a serene baptism celebration table with white flowers, candles, a simple cake and soft neutral decor",
  formatura:
    "a graduation celebration hall with a decorated table, a cap and diploma, and subtle festive lighting",
  corporativo:
    "an elegant corporate buffet table with platters of food, a coffee-break station, glassware and modern neutral decor",
  generico:
    "a beautiful event table with flowers, candles, elegant tableware and a welcoming celebration setting",
} as const;

export type EventSceneKey = keyof typeof EVENT_SCENES;

const ANGLES = [
  { id: "wide", text: "wide architectural view" },
  { id: "three-quarter", text: "three-quarter view" },
  { id: "tight", text: "tight still-life framing" },
  { id: "eye", text: "eye-level view across the room" },
  { id: "elevated", text: "slightly elevated view" },
  { id: "along", text: "view along the length of the table" },
] as const;

const PALETTES = [
  { id: "ivory-wine", text: "warm ivory and wine palette" },
  { id: "blush", text: "soft blush and cream palette" },
  { id: "green-gold", text: "deep green foliage and gold palette" },
  { id: "terracotta", text: "terracotta and linen palette" },
  { id: "candle", text: "candlelight and navy night palette" },
  { id: "sage", text: "sage and white palette" },
] as const;

/**
 * Campo `negative_prompt` do ModelsLab. A NVIDIA não tem esse campo, então a
 * mesma lista entra no texto como `Avoid:`.
 */
export const IMAGE_NEGATIVE =
  "people, person, persons, guests, hands, faces, portrait, dancing, running, jumping, dynamic poses, motion blur, extra limbs, extra arms, deformed hands, distorted faces, mutated anatomy, extra fingers, blurry";

const BEAUTY =
  "Beautiful, elegant, generic event setting with editorial styling and no recognizable venue brand.";

const NO_PEOPLE =
  "No people at all: no guests, no person, no hands, no faces; the place, the table, the food and the decor carry the image.";

const STILLNESS = "Static photograph, calm composition, no motion, no movement, no motion blur.";

const SPACE = ANGLES.length * PALETTES.length;

function mod(index: number, length: number): number {
  const n = Math.trunc(index);
  return ((n % length) + length) % length;
}

/**
 * Normaliza o tipo do evento em texto livre para a chave da cena.
 * Aceita tanto os códigos do catálogo (`festa_infantil`, `quinze_anos`) quanto
 * rótulos em português ("Festa infantil", "15 anos", "Corporativo").
 */
export function eventSceneKey(eventType: string | null | undefined): EventSceneKey {
  const value = (eventType ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/15|quinze/.test(value)) return "quinze_anos";
  if (/infantil|crian/.test(value)) return "festa_infantil";
  if (/anivers/.test(value)) return "aniversario";
  if (/batiz/.test(value)) return "batizado";
  if (/casa|wedding/.test(value)) return "casamento";
  if (/format|gradua/.test(value)) return "formatura";
  if (/corporat|empresa|confratern|convenc|lan[cç]amento/.test(value)) return "corporativo";
  return "generico";
}

/** Descrição da cena do tipo de evento (fallback: ambiente genérico bonito). */
export function eventScene(eventType: string | null | undefined): string {
  return EVENT_SCENES[eventSceneKey(eventType)];
}

export interface SceneRecipe {
  id: string;
  subject: string;
  angle: string;
  palette: string;
}

/** Assunto (tipo do evento), ângulo e paleta deste índice. Sem pessoas. */
export function sceneRecipe(index: number, eventType?: string | null): SceneRecipe {
  const n = mod(index, SPACE);
  const key = eventSceneKey(eventType);
  const subject = EVENT_SCENES[key];
  const angle = ANGLES[n % ANGLES.length] ?? ANGLES[0];
  const palette = PALETTES[Math.floor(n / ANGLES.length) % PALETTES.length] ?? PALETTES[0];
  return {
    id: `${key}-${angle.id}-${palette.id}`,
    subject,
    angle: angle.text,
    palette: palette.text,
  };
}

/**
 * Texto acrescentado ao prompt. Inclui `Avoid:` porque a NVIDIA não tem campo
 * negativo. Nunca pede pessoas e sempre pede uma cena estática.
 */
export function sceneDirective(index: number, eventType?: string | null): string {
  const recipe = sceneRecipe(index, eventType);
  return [
    recipe.subject,
    recipe.angle,
    recipe.palette,
    BEAUTY,
    NO_PEOPLE,
    STILLNESS,
    `Avoid: ${IMAGE_NEGATIVE}.`,
  ].join(" ");
}

/** Garante a cláusula Avoid no texto enviado à NVIDIA. */
export function withNvidiaAvoidance(prompt: string, negative: string = IMAGE_NEGATIVE): string {
  if (prompt.includes("Avoid:")) return prompt;
  return `${prompt.trim()} Avoid: ${negative}.`;
}

/** Acrescenta a cena desta publicação ao prompt, sem pedir texto na imagem. */
export function withFreshScene(prompt: string, index: number, eventType?: string | null): string {
  return `${prompt.trim()} ${sceneDirective(index, eventType)} No text.`;
}
