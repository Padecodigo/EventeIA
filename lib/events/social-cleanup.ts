import "server-only";

import { logger } from "@/lib/logger";
import { metaPublishConfigFromProcessEnv } from "@/lib/meta/config";
import {
  deleteEventPublications,
  type DeleteEventPublicationsResult,
  type PublicationCleanupDb,
} from "@/lib/prospecting/delete-publications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Limpeza das publicações sociais de eventos apagados pelo usuário
 * (`user_deleted_at`, 0075). É a mesma rotina idempotente do encerramento:
 * posts do evento + posts de isca, Instagram + Página, mantendo ids em falha.
 */

interface DeletedEventsDb {
  from(table: "events"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        not(
          column: string,
          op: string,
          value: null,
        ): {
          is(
            column: string,
            value: null,
          ): {
            limit(n: number): PromiseLike<{
              data: { id: string }[] | null;
              error: { code?: string } | null;
            }>;
          };
        };
      };
    };
  };
}

export interface EventSocialCleanupDeps {
  db?: PublicationCleanupDb;
  meta?: ReturnType<typeof metaPublishConfigFromProcessEnv>;
}

function cleanupDb(db: PublicationCleanupDb | undefined): PublicationCleanupDb {
  if (db !== undefined) return db;
  // O client Supabase completo estoura a inferência recursiva; o contrato
  // mínimo abaixo é o mesmo já validado pelos testes de limpeza.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return getSupabaseAdmin() as unknown as PublicationCleanupDb;
}

export async function cleanupEventPublicationsById(
  eventIds: readonly string[],
  deps: EventSocialCleanupDeps = {},
): Promise<DeleteEventPublicationsResult> {
  const db = cleanupDb(deps.db);
  const meta = deps.meta === undefined ? metaPublishConfigFromProcessEnv() : deps.meta;
  const total: DeleteEventPublicationsResult = { removed: 0, rowsDeleted: 0, pending: 0 };
  const manualRemoval: NonNullable<DeleteEventPublicationsResult["manualRemoval"]> = [];

  for (const eventId of eventIds) {
    const result = await deleteEventPublications({ db, eventId, meta });
    total.removed += result.removed;
    total.rowsDeleted += result.rowsDeleted;
    total.pending += result.pending;
    if (result.manualRemoval !== undefined) manualRemoval.push(...result.manualRemoval);
  }

  return {
    ...total,
    ...(manualRemoval.length > 0 ? { manualRemoval } : {}),
  };
}

/** Eventos apagados pelo usuário que ainda podem ter publicação remota. */
export async function cleanupUserDeletedEventHistory(
  profileId: string,
  deps: EventSocialCleanupDeps = {},
): Promise<DeleteEventPublicationsResult> {
  const admin = getSupabaseAdmin();
  const db = admin as unknown as DeletedEventsDb;
  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("user_deleted_by", profileId)
    .not("user_deleted_at", "is", null)
    .is("user_purged_at", null)
    .limit(500);
  if (error !== null) {
    throw new Error(`falha ao listar eventos apagados pelo usuário (${error.code ?? "?"})`);
  }
  const ids = (data ?? []).map((event) => event.id);
  if (ids.length === 0) return { removed: 0, rowsDeleted: 0, pending: 0 };
  return cleanupEventPublicationsById(ids, deps);
}

/** Confirma que o evento realmente foi apagado pelo usuário autenticado. */
async function isOwnedDeletedEvent(profileId: string, eventId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("user_deleted_by", profileId)
    .not("user_deleted_at", "is", null)
    .maybeSingle();
  if (error !== null) {
    logger.warn?.(
      { profileId, eventId, code: error.code },
      "não foi possível validar posse do evento apagado",
    );
    return false;
  }
  return data !== null;
}

/** Best-effort para server actions: nunca desfaz a exclusão por falha de mídia. */
export async function cleanupEventHistorySafely(
  input: { profileId: string; eventId?: string },
  deps: EventSocialCleanupDeps = {},
): Promise<void> {
  try {
    let result: DeleteEventPublicationsResult;
    if (input.eventId !== undefined) {
      // Nunca confie apenas no eventId do formulário: revalide a posse.
      if (!(await isOwnedDeletedEvent(input.profileId, input.eventId))) {
        logger.warn?.(
          { profileId: input.profileId, eventId: input.eventId },
          "limpeza social recusada: evento não pertence ao usuário ou não está apagado",
        );
        return;
      }
      result = await cleanupEventPublicationsById([input.eventId], deps);
    } else {
      result = await cleanupUserDeletedEventHistory(input.profileId, deps);
    }
    if (result.pending > 0) {
      logger.warn?.(
        { profileId: input.profileId, eventId: input.eventId, pending: result.pending },
        "exclusão de histórico: limpeza social ficou pendente para retry",
      );
    }
  } catch (caught) {
    logger.warn?.(
      {
        profileId: input.profileId,
        eventId: input.eventId,
        reason: caught instanceof Error ? caught.message : "desconhecido",
      },
      "exclusão de histórico: falha ao limpar publicações sociais",
    );
  }
}
