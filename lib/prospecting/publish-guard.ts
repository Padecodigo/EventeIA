import "server-only";

/**
 * Guarda de publicação: evento encerrado/excluído nunca volta a publicar.
 *
 * Vale para o caminho síncrono (Graph) e para jobs já enfileirados (browser).
 * A checagem é feita no momento da execução — não basta remover o job da fila,
 * porque ele pode já estar em andamento.
 */

export interface EventPublicationState {
  status?: string | null;
  closedAt?: string | null;
  closed_at?: string | null;
  userDeletedAt?: string | null;
  user_deleted_at?: string | null;
}

const TERMINAL_STATUSES = new Set(["completed", "canceled"]);

function closedAtOf(event: EventPublicationState): string | null {
  return event.closedAt ?? event.closed_at ?? null;
}

function userDeletedAtOf(event: EventPublicationState): string | null {
  return event.userDeletedAt ?? event.user_deleted_at ?? null;
}

/**
 * `undefined` = evento não informado (fluxo geral, permitido).
 * `null` = evento informado e inexistente → bloqueado.
 */
export function canPublishForEvent(event: EventPublicationState | null | undefined): boolean {
  if (event === undefined) return true;
  if (event === null) return false;
  if (event.status !== undefined && event.status !== null && TERMINAL_STATUSES.has(event.status)) {
    return false;
  }
  if (closedAtOf(event) !== null) return false;
  if (userDeletedAtOf(event) !== null) return false;
  return true;
}

export function isPublicationBlockedByEvent(
  event: EventPublicationState | null | undefined,
): boolean {
  return !canPublishForEvent(event);
}

interface EventLookupDb {
  from(table: "events"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: {
            id: string;
            status: string | null;
            closed_at?: string | null;
            user_deleted_at?: string | null;
          } | null;
        }>;
      };
    };
  };
}

/** Lê o estado atual no banco (worker): sem evento ou terminal = bloqueado. */
export async function eventAllowsPublication(db: EventLookupDb, eventId: string): Promise<boolean> {
  const { data } = await db
    .from("events")
    .select("id,status,closed_at,user_deleted_at")
    .eq("id", eventId)
    .maybeSingle();
  if (data === null) return false;
  return canPublishForEvent({
    status: data.status,
    closed_at: data.closed_at ?? null,
    user_deleted_at: data.user_deleted_at ?? null,
  });
}
