/** Horários da festa: "HH:MM" 24h; fim pode passar da meia-noite. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DURATION_KEY = "duracao_horas";
export const DEFAULT_START = "18:00";

function toMinutes(value: string): number | null {
  if (!TIME_RE.test(value)) return null;
  const [h, m] = value.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Duração em horas (fração) de início→fim; fim ≤ início ⇒ vira o dia. Igual ⇒ null. */
export function durationHours(start: string, end: string): number | null {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || a === b) return null;
  const diff = b > a ? b - a : b + 24 * 60 - a;
  return diff / 60;
}

export function addHours(start: string, hours: number): string {
  const a = toMinutes(start) ?? 18 * 60;
  const total = (a + Math.round(hours * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "das 22:00 às 03:00 (5h, termina no dia seguinte)". */
export function formatSchedule(start: string, end: string): string {
  const h = durationHours(start, end);
  if (h === null) return `às ${start}`;
  const dur = Number.isInteger(h) ? `${String(h)}h` : `${h.toFixed(1).replace(".", ",")}h`;
  const overnight = (toMinutes(end) ?? 0) <= (toMinutes(start) ?? 0);
  return `das ${start} às ${end} (${dur}${overnight ? ", termina no dia seguinte" : ""})`;
}
