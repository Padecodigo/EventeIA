import { MESSAGING_WINDOW_HOURS, PRIVATE_REPLY_WINDOW_DAYS } from "@/lib/meta/limits";

/**
 * Janelas de mensagem da Meta — valores confirmados em `lib/meta/limits.ts`.
 * Funções puras: recebem "agora" por parâmetro (determinísticas, testáveis).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MESSAGING_WINDOW_MS = MESSAGING_WINDOW_HOURS * HOUR_MS;
export const PRIVATE_REPLY_WINDOW_MS = PRIVATE_REPLY_WINDOW_DAYS * DAY_MS;

/** A resposta só é permitida dentro de 24h da última mensagem do fornecedor. */
export function isWithinMessagingWindow(lastInboundAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - lastInboundAt.getTime();
  return elapsed >= 0 && elapsed <= MESSAGING_WINDOW_MS;
}

export function privateReplyDeadline(commentAt: Date): Date {
  return new Date(commentAt.getTime() + PRIVATE_REPLY_WINDOW_MS);
}

/** Private reply a comentário: até 7 dias após o comentário. */
export function isWithinPrivateReplyWindow(commentAt: Date, now: Date): boolean {
  return now.getTime() <= privateReplyDeadline(commentAt).getTime();
}
