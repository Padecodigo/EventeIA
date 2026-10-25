/** "1.234,56" | "1234.56" | "50" → centavos (null se inválido). Puro. */
export function parseBrlToCents(input: string): number | null {
  const s = input.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const v = Math.round(Number(norm) * 100);
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** centavos BRL → micro-USD pelo câmbio (micro-BRL por US$) — inverso de microUsdToBrlCents. */
export function brlCentsToMicroUsd(cents: number, brlPerUsdMicro: number): number {
  return Math.round((cents * 10_000_000_000) / brlPerUsdMicro);
}
