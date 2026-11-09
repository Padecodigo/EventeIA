/**
 * Arte por tipo de evento — acervo do próprio site (assets com a marca em
 * /public/brand). Usada como fallback estático do autopilot e nos posts de
 * prospecção (isca).
 */

/** Normaliza o tipo do evento (texto livre) para a chave do acervo. */
export function photoKeyForEventType(type: string | null | undefined): string {
  const value = (type ?? "").toLowerCase();
  if (/15|quinze/.test(value)) return "15-anos";
  if (/infantil|crian|anivers/.test(value)) return value.includes("anivers") ? "aniversario" : "infantil";
  if (/casa|wedding/.test(value)) return "casamento";
  if (/format|gradua/.test(value)) return "formatura";
  if (/corporat|empresa/.test(value)) return "corporativo";
  return "infantil";
}

/** Arte pronta com a marca, por tipo de evento (assets em /public/brand/posts). */
export function artForEventType(type: string | null | undefined): string {
  return `/brand/posts/${photoKeyForEventType(type)}.jpg`;
}

/** Arte vertical 9:16 com a marca, por tipo de evento (assets em /public/brand/stories). */
export function storyArtForEventType(type: string | null | undefined): string {
  return `/brand/stories/${photoKeyForEventType(type)}.jpg`;
}

/** Reel vertical 9:16 com a marca, por tipo de evento (assets em /public/brand/reels). */
export function reelArtForEventType(type: string | null | undefined): string {
  return `/brand/reels/${photoKeyForEventType(type)}.mp4`;
}
