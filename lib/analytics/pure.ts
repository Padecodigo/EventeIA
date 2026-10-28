/**
 * Agregações do painel de métricas — puras e testáveis.
 * Dias no fuso de São Paulo (o produto é BR).
 */

export interface TimestampedRow {
  created_at: string;
}

export interface DailyPoint {
  day: string;
  count: number;
}

const TZ = "America/Sao_Paulo";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(date: Date): string {
  return dayFormat.format(date);
}

/** Últimos `days` dias (YYYY-MM-DD), do mais antigo ao mais recente. */
export function lastNDays(days: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    out.push(dayKey(d));
  }
  return out;
}

/** Conta as linhas por dia e preenche os dias sem dados com 0. */
export function countByDay(
  rows: readonly TimestampedRow[],
  days: number,
  now: Date,
): DailyPoint[] {
  const keys = lastNDays(days, now);
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const row of rows) {
    const key = dayKey(new Date(row.created_at));
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

/** Soma simples. */
export function total(rows: readonly TimestampedRow[]): number {
  return rows.length;
}

/** Máximo de um conjunto (para escala do gráfico; nunca 0). */
export function maxCount(points: readonly DailyPoint[]): number {
  return Math.max(1, ...points.map((p) => p.count));
}

/** Converte "YYYY-MM-DD" em "dd/mm". */
export function shortDay(day: string): string {
  const [, month, dayOfMonth] = day.split("-");
  return `${dayOfMonth ?? "?"}/${month ?? "?"}`;
}
