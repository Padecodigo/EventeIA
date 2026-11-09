import { brazilianCastAt } from "./brazilian-cast";

/**
 * Regras de cena do Flux (isca e publicidade).
 * O índice muda assunto, ângulo e paleta. Pessoas só a cada 5 índices,
 * paradas e distantes. A mesma entrada produz a mesma descrição.
 */

const SUBJECTS = [
  { id: "venue", text: "an empty decorated Brazilian event venue, wide and still" },
  { id: "table", text: "a long banquet table with linen, glassware and flowers, no one seated" },
  { id: "flowers", text: "a close still life of flowers, candles and foliage" },
  { id: "food", text: "plated food and a dessert table, untouched and still" },
  { id: "garden", text: "the garden and facade of a Brazilian celebration venue at rest" },
  { id: "place", text: "a quiet place setting, chairs aligned, no guests" },
  { id: "lights", text: "still string lights over an empty terrace" },
  { id: "hall", text: "the empty hall before guests arrive, tables already dressed" },
] as const;

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

/** Campo `negative_prompt` do ModelsLab. A NVIDIA não tem esse campo. */
export const IMAGE_NEGATIVE =
  "dancing, running, jumping, dynamic poses, motion blur, extra limbs, extra arms, deformed hands, distorted faces, mutated anatomy, extra fingers, blurry";

const STILLNESS = "Static, calm composition. Motion is absent. Poses stay still.";

const SPACE = SUBJECTS.length * ANGLES.length * PALETTES.length;

function mod(index: number, length: number): number {
  const n = Math.trunc(index);
  return ((n % length) + length) % length;
}

export interface SceneRecipe {
  id: string;
  subject: string;
  angle: string;
  palette: string;
  includePeople: boolean;
}

/** Assunto, ângulo e paleta deste índice. Pessoas só quando o índice é múltiplo de 5. */
export function sceneRecipe(index: number): SceneRecipe {
  const n = mod(index, SPACE);
  const subject = SUBJECTS[n % SUBJECTS.length] ?? SUBJECTS[0];
  const angle = ANGLES[Math.floor(n / SUBJECTS.length) % ANGLES.length] ?? ANGLES[0];
  const palette =
    PALETTES[Math.floor(n / (SUBJECTS.length * ANGLES.length)) % PALETTES.length] ?? PALETTES[0];
  const includePeople = mod(index, 5) === 0;
  return {
    id: `${subject.id}-${angle.id}-${palette.id}${includePeople ? "-people" : "-place"}`,
    subject: subject.text,
    angle: angle.text,
    palette: palette.text,
    includePeople,
  };
}

/** Chave gravada em `autopilot_media` para não repetir a mesma cena. */
export function sceneStorageKey(theme: string, index: number): string {
  return `scene:${theme}:${sceneRecipe(index).id}`;
}

/**
 * Próximo índice cuja cena ainda não está nas publicações recentes.
 * `attempt` afasta as novas tentativas da mesma leva.
 */
export function nextSceneIndex(
  start: number,
  usedKeys: ReadonlySet<string>,
  theme: string,
  attempt = 0,
): number {
  const origin = Math.trunc(start) + Math.trunc(attempt) * 17;
  for (let step = 0; step < SPACE; step += 1) {
    const index = origin + step;
    if (!usedKeys.has(sceneStorageKey(theme, index))) return index;
  }
  return origin + SPACE;
}

function peopleLine(index: number, includePeople: boolean): string {
  if (!includePeople) {
    return "No people in the frame. The place, the table, the flowers and the food carry the image.";
  }
  return `${brazilianCastAt(index)} People are rare, static, distant or partial, calm, not a foreign stock photo.`;
}

/** Texto acrescentado ao prompt. Inclui `Avoid:` porque a NVIDIA não tem campo negativo. */
export function sceneDirective(index: number): string {
  const recipe = sceneRecipe(index);
  return [
    recipe.subject,
    recipe.angle,
    recipe.palette,
    peopleLine(index, recipe.includePeople),
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
export function withFreshScene(prompt: string, index: number): string {
  return `${prompt.trim()} ${sceneDirective(index)} No text.`;
}
