/**
 * Versão otimista (`updated_at`) estritamente maior que a anterior.
 * O Postgres pode devolver microssegundos e offset; Date.parse normaliza para
 * ms e somamos 1ms quando o relógio atual não avançou.
 */
export function nextVersionTimestamp(previous: string | null | undefined, now: Date): string {
  const nowMs = Math.floor(now.getTime());
  const previousMs =
    previous === null || previous === undefined ? Number.NaN : Date.parse(previous);
  const minimum = Number.isFinite(previousMs)
    ? Math.floor(previousMs) + 1
    : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(nowMs, minimum)).toISOString();
}
