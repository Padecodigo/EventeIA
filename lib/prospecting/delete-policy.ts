/**
 * Política de exclusão dos posts de isca (pura, sem I/O).
 *
 * Um post é excluído quando:
 * - tem evento e o evento saiu do ciclo de prospecção (completed/canceled), ou
 * - não tem evento ("acervo geral") e já passou o TTL de órfão.
 */

export const FINISHED_EVENT_STATUSES = ["completed", "canceled"] as const;

/** TTL padrão para posts sem evento (acervo geral). */
export const ORPHAN_POST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isEventProspectingDone(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && (FINISHED_EVENT_STATUSES as readonly string[]).includes(status);
}

export interface ShouldDeleteInput {
  /** Status do evento associado; null = post sem evento (acervo geral). */
  eventStatus: string | null;
  createdAt: Date;
  now: Date;
  orphanTtlMs?: number;
}

export function shouldDeletePost(input: ShouldDeleteInput): boolean {
  if (input.eventStatus !== null) {
    return isEventProspectingDone(input.eventStatus);
  }
  const ttl = input.orphanTtlMs ?? ORPHAN_POST_TTL_MS;
  return input.createdAt.getTime() + ttl <= input.now.getTime();
}
