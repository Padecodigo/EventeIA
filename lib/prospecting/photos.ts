/**
 * Foto real por tipo de evento — acervo do próprio site (sem IA, sem banco
 * externo). Usada como base da arte com a marca no post de prospecção.
 */

export const EVENT_PHOTOS: Record<string, string> = {
  infantil: "/img/eventos/festa-infantil-velas.jpg",
  aniversario: "/festa-aniversario.jpg",
  casamento: "/img/eventos/casamento.jpg",
  "15-anos": "/img/eventos/15-anos.jpg",
  quinze: "/img/eventos/15-anos.jpg",
  formatura: "/img/eventos/festa-formatura-baile.jpg",
  corporativo: "/img/eventos/corporativo.webp",
};

export const EVENT_PHOTO_FALLBACK = "/img/eventos/festa-infantil-velas.jpg";

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

export function photoForEventType(type: string | null | undefined): string {
  return EVENT_PHOTOS[photoKeyForEventType(type)] ?? EVENT_PHOTO_FALLBACK;
}

/** Arte pronta com a marca, por tipo de evento (assets em /public/brand/posts). */
export function artForEventType(type: string | null | undefined): string {
  return `/brand/posts/${photoKeyForEventType(type)}.jpg`;
}
