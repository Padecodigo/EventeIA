import { DISCOVERY_WINDOW } from "@/lib/business-days";
import { spMidnight } from "@/lib/search-start";

/**
 * Trava de edição (0073 + 0074). Dados do evento e a data de início da busca
 * ficam editáveis ATÉ o instante agendado do início da busca (abertura da janela
 * comercial no dia escolhido, 09:00 de Brasília). Travam a partir desse instante,
 * ou antes, se a busca já começou. Evento encerrado também fica travado.
 * O orçamento limite é editável sempre, mesmo depois de encerrado.
 * Espelha public.event_edit_locked — o banco é a garantia final.
 */
export interface EditLockInput {
  status: string;
  discovery_started_at: string | null;
  search_start_date: string | null;
}

/** Instante agendado do início da busca (null = "o quanto antes"). */
export function scheduledSearchStartAt(searchStartDate: string | null): Date | null {
  if (searchStartDate === null) return null;
  return new Date(spMidnight(searchStartDate).getTime() + DISCOVERY_WINDOW.startHour * 3_600_000);
}

export function isEventStarted(event: EditLockInput, now: Date = new Date()): boolean {
  if (event.status === "completed") return true;
  if (event.status !== "active") return false;
  if (event.discovery_started_at !== null) return true;
  const startAt = scheduledSearchStartAt(event.search_start_date);
  return startAt !== null && now.getTime() >= startAt.getTime();
}

export const STARTED_EVENT_LOCK_MESSAGE =
  "A busca de fornecedores já começou: os dados, a entrevista e a data de início não podem mais ser alterados. Só o orçamento limite continua editável.";
