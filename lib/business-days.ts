/**
 * Dias úteis brasileiros (America/Sao_Paulo, UTC-3 fixo desde o fim do horário de verão em 2019).
 * Módulo puro — tabela computada: feriados nacionais fixos + móveis baseados na Páscoa
 * (Carnaval seg/ter, Sexta-feira Santa, Corpus Christi). Sem I/O, testável.
 */

const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Feriados nacionais fixos (MM-DD). 20/11 é nacional desde a Lei 14.759/2023. */
const FIXED_HOLIDAYS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

/** Domingo de Páscoa (algoritmo de Meeus/Butcher), em UTC à meia-noite. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

/** Conjunto de feriados (YYYY-MM-DD) do ano. */
export function brazilHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const set = new Set(FIXED_HOLIDAYS.map((md) => `${year}-${md}`));
  const easter = easterSunday(year).getTime();
  for (const offset of [-48, -47, -2, 60]) set.add(iso(new Date(easter + offset * DAY_MS)));
  cache.set(year, set);
  return set;
}

/** "Data civil" de SP representada como Date UTC (campos UTC = campos locais). */
function toLocal(now: Date): Date {
  return new Date(now.getTime() + SP_OFFSET_MS);
}
function fromLocal(local: Date): Date {
  return new Date(local.getTime() - SP_OFFSET_MS);
}

export function isBusinessDayKey(key: string): boolean {
  const d = new Date(`${key}T00:00:00Z`);
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !brazilHolidays(d.getUTCFullYear()).has(key);
}

/** É dia útil em SP no instante dado? */
export function isBusinessDay(now: Date): boolean {
  return isBusinessDayKey(iso(toLocal(now)));
}

export interface BusinessWindow {
  startHour: number;
  endHour: number;
}

/** Janela do contato com fornecedores (WhatsApp). */
export const OUTREACH_WINDOW: BusinessWindow = { startHour: 9, endHour: 18 };
/** Janela da descoberta (busca) — mesma do contato: dia útil, 9h–18h de Brasília (regra dura). */
export const DISCOVERY_WINDOW: BusinessWindow = { startHour: 9, endHour: 18 };

/** Dentro da janela útil agora? */
export function isWithinBusinessWindow(now: Date, w: BusinessWindow): boolean {
  if (!isBusinessDay(now)) return false;
  const local = toLocal(now);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutes >= w.startHour * 60 && minutes < w.endHour * 60;
}

/** Próximo instante (UTC) em que a janela útil abre; `now` se já estiver aberta. */
export function nextBusinessWindowStart(now: Date, w: BusinessWindow): Date {
  if (isWithinBusinessWindow(now, w)) return now;
  const local = toLocal(now);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  // Hoje ainda antes da abertura e dia útil → abre hoje.
  let cursor = minutes < w.startHour * 60 ? day : new Date(day.getTime() + DAY_MS);
  for (let i = 0; i < 30 && !isBusinessDayKey(iso(cursor)); i++) cursor = new Date(cursor.getTime() + DAY_MS);
  return fromLocal(new Date(cursor.getTime() + w.startHour * 60 * 60 * 1000));
}

/** ms até a janela abrir (0 = pode rodar agora). */
export function msUntilBusinessWindow(now: Date, w: BusinessWindow): number {
  return Math.max(0, nextBusinessWindowStart(now, w).getTime() - now.getTime());
}

/**
 * Prazo de N dias úteis a partir de `now` (a contagem começa no próximo dia útil quando
 * hoje não é útil ou a janela de contato já fechou). Retorna a chave YYYY-MM-DD (SP).
 */
export function addBusinessDays(now: Date, n: number): string {
  const start = nextBusinessWindowStart(now, OUTREACH_WINDOW);
  let cursor = new Date(Date.UTC(toLocal(start).getUTCFullYear(), toLocal(start).getUTCMonth(), toLocal(start).getUTCDate()));
  let remaining = n;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDayKey(iso(cursor))) remaining--;
  }
  return iso(cursor);
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "segunda, 27/10" a partir de YYYY-MM-DD. */
export function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}
