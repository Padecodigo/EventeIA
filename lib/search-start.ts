import { DISCOVERY_WINDOW, isBusinessDayKey, nextBusinessWindowStart, type BusinessWindow } from "@/lib/business-days";

/** Data agendada pelo cliente para começar a busca de fornecedores (YYYY-MM-DD, fuso de Brasília). */
export type SearchStartKey = string;

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Dia (YYYY-MM-DD) em Brasília para um instante. */
export function spDateKey(now: Date): string {
  return new Date(now.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);
}

/** Meia-noite de Brasília do dia `key`, em UTC. */
export function spMidnight(key: string): Date {
  return new Date(`${key}T03:00:00.000Z`);
}

/** Valida a data escolhida: dia útil, a partir de hoje, antes da data do evento. Retorna mensagem de erro ou null. */
export function validateSearchStartDate(key: string, eventDate: string, now: Date = new Date()): string | null {
  if (!KEY_RE.test(key) || Number.isNaN(spMidnight(key).getTime())) return "Escolha uma data válida para começar a busca.";
  if (key < spDateKey(now)) return "A busca não pode começar em uma data que já passou.";
  if (key >= eventDate) return "A busca precisa começar antes da data do evento.";
  if (!isBusinessDayKey(key)) return "Escolha um dia útil (segunda a sexta, sem feriados nacionais).";
  return null;
}

/** Instante em que a busca pode começar: abertura da janela comercial no dia agendado (ou a próxima, se "o quanto antes"). */
export function searchStartInstant(
  now: Date,
  startKey: string | null | undefined,
  window: BusinessWindow = DISCOVERY_WINDOW,
): Date {
  const from = startKey !== null && startKey !== undefined && spMidnight(startKey).getTime() > now.getTime() ? spMidnight(startKey) : now;
  return nextBusinessWindowStart(from, window);
}

/** ms até a busca poder rodar (0 = pode agora). */
export function msUntilSearchStart(now: Date, startKey: string | null | undefined, window: BusinessWindow = DISCOVERY_WINDOW): number {
  return Math.max(0, searchStartInstant(now, startKey, window).getTime() - now.getTime());
}

/** O cliente ainda pode alterar a data enquanto a busca não começou. */
export function canEditSearchStart(
  event: { discovery_started_at: string | null; quotes_delivered_at: string | null },
): boolean {
  return event.discovery_started_at === null && event.quotes_delivered_at === null;
}

export type SearchStartParse = { ok: true; value: string | null } | { ok: false; error: string };

/** Lê o campo do formulário: modo "asap" (padrão) → null; modo "date" → data validada (dia útil, sem feriado). */
export function parseSearchStartInput(
  mode: unknown,
  date: unknown,
  eventDate: string,
  now: Date = new Date(),
): SearchStartParse {
  if (mode === null || mode === undefined || mode === "" || mode === "asap") return { ok: true, value: null };
  if (mode !== "date") return { ok: false, error: "Escolha quando começar a busca." };
  const key = typeof date === "string" ? date.trim() : "";
  const error = validateSearchStartDate(key, eventDate, now);
  return error === null ? { ok: true, value: key } : { ok: false, error };
}
