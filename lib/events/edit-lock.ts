/**
 * Evento iniciado fica travado (0073): depois que começou, o cliente só altera o
 * orçamento limite. Espelha public.event_is_started — o banco é a garantia final.
 */
export interface EditLockInput {
  status: string;
  discovery_started_at: string | null;
  interview_completed_at: string | null;
}

export function isEventStarted(event: EditLockInput): boolean {
  if (event.status === "completed") return true;
  return (
    event.status === "active" &&
    (event.discovery_started_at !== null || event.interview_completed_at !== null)
  );
}

export const STARTED_EVENT_LOCK_MESSAGE =
  "Este evento já começou: os dados e a entrevista não podem mais ser alterados. Só o orçamento limite continua editável.";
