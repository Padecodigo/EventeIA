/**
 * Elenco brasileiro para o FLUX. Cada post escolhe um índice seguido
 * (0, 1, 2…): descrições consecutivas são sempre diferentes.
 * Não há um tom único. A cena continua sem texto — o layout entra depois.
 */

export const BRAZILIAN_CASTS = [
  "Brazilian people with light warm skin and natural features, in a Brazilian place, candid, not a foreign stock photo",
  "Brazilian people with morena skin and natural features, in a Brazilian place, candid, not a foreign stock photo",
  "Brazilian people with parda skin and natural features, in a Brazilian place, candid, not a foreign stock photo",
  "Brazilian people with negra skin and natural features, in a Brazilian place, candid, not a foreign stock photo",
  "Brazilian people of Asian descent with natural features, in a Brazilian place, candid, not a foreign stock photo",
  "Brazilian indigenous people with natural features, in a Brazilian place, candid, not a foreign stock photo",
  "a mixed Brazilian group with light, morena and negra skin together, natural and unposed, in a Brazilian place, not a foreign stock photo",
  "Brazilian people with mestiço features and more than one skin tone together, natural, in a Brazilian place, not a foreign stock photo",
] as const;

export const SCENE_MOMENTS = [
  "late afternoon side light",
  "early evening lamps",
  "soft morning window light",
  "a closer framing",
  "a wider view of the room",
  "a candid mid-conversation",
  "just after a toast",
  "during the preparations",
] as const;

function slot(index: number, length: number): number {
  const n = Math.trunc(index);
  return ((n % length) + length) % length;
}

/** Descrição do elenco para este post. O índice seguinte nunca repete a anterior. */
export function brazilianCastAt(index: number): string {
  return BRAZILIAN_CASTS[slot(index, BRAZILIAN_CASTS.length)] ?? BRAZILIAN_CASTS[0];
}

/** Momento da cena, defasado do elenco para o par não repetir junto. */
export function sceneMomentAt(index: number): string {
  return SCENE_MOMENTS[slot(index + 3, SCENE_MOMENTS.length)] ?? SCENE_MOMENTS[0];
}
