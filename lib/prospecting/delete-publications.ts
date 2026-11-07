import "server-only";

import { logger } from "@/lib/logger";
import {
  deleteFacebookPost,
  deleteMedia,
  type MetaPublishConfig,
  type RemoteChannel,
  type RemoteDeleteOutcome,
} from "@/lib/meta/publishing";

import { manualRemovalFromRow } from "./browser-publication";
import { nextVersionTimestamp } from "./version-timestamp";
import {
  publicationHasRefs,
  setChannelState,
  stateFromImageParams,
  stateFromPublicationColumn,
  withPublicationState,
  type PublicationState,
} from "./publication-state";

/**
 * Remoção idempotente das publicações ligadas a um evento.
 *
 * Cobre as duas tabelas do fluxo:
 * - `prospecting_posts` — post de prospecção do evento;
 * - `prospect_posts` — posts de isca/prospecção geral.
 * E os dois canais: Instagram (`ig_media_id`) e Página do Facebook (`fb_post_id`).
 *
 * Regra de ouro: se QUALQUER canal falhar de verdade (ex.: IG 2207085), a linha
 * é mantida com os ids/links para o próximo sweep tentar de novo. "Remoto já
 * ausente" (404 / objeto inexistente) conta como removido.
 */

export type PublicationTable = "prospecting_posts" | "prospect_posts";

export interface PublicationRow {
  id: string;
  event_id?: string | null;
  ig_media_id?: string | null;
  fb_post_id?: string | null;
  image_params?: unknown;
  publication?: unknown;
  error?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
}

export interface ManualRemovalRef {
  table: PublicationTable;
  rowId: string;
  link: string | null;
  reason: string;
}

interface QueryResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

export interface PublicationQuery {
  eq(column: string, value: string): PublicationQuery;
  not?(column: string, op: string, value: null): PublicationQuery;
  is?(column: string, value: null): PublicationQuery;
  order?(column: string, options: { ascending: boolean }): PublicationQuery;
  range?(from: number, to: number): PromiseLike<QueryResult<PublicationRow[]>>;
  limit(n: number): PromiseLike<QueryResult<PublicationRow[]>>;
}

interface PublicationMutationQuery extends PromiseLike<QueryResult<{ id: string }[]>> {
  eq(column: string, value: string): PublicationMutationQuery;
  select?(columns: string): Promise<QueryResult<{ id: string }[]>>;
}

export interface PublicationTableClient {
  select(columns: string): PublicationQuery;
  update?(values: Record<string, unknown>): PublicationMutationQuery;
  delete?(): PublicationMutationQuery;
}

export interface PublicationCleanupDb {
  from(table: PublicationTable): PublicationTableClient;
}

export type DeleteMediaFn = (
  input: MetaPublishConfig & { mediaId: string },
) => Promise<RemoteDeleteOutcome>;

export type DeleteFacebookPostFn = (
  input: MetaPublishConfig & { postId: string },
) => Promise<RemoteDeleteOutcome>;

export interface DeletePublicationChannelsInput {
  igMediaId?: string | null;
  fbPostId?: string | null;
  meta: MetaPublishConfig;
  deleteMediaFn?: DeleteMediaFn;
  deleteFacebookPostFn?: DeleteFacebookPostFn;
}

export interface DeletePublicationChannelsResult {
  kind: "complete" | "partial";
  outcomes: RemoteDeleteOutcome[];
  deleted: RemoteChannel[];
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Id do Facebook guardado no JSON legado de image_params, se a coluna não existir. */
export function facebookIdFromImageParams(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const publication = (value as { publication?: unknown }).publication;
  if (
    publication === null ||
    publication === undefined ||
    typeof publication !== "object" ||
    Array.isArray(publication)
  ) {
    return null;
  }
  return nonEmpty((publication as { fbPostId?: string | null }).fbPostId);
}

/** Apaga os canais existentes de UMA linha. Só ok quando todos foram removidos. */
export async function deletePublicationChannels(
  input: DeletePublicationChannelsInput,
): Promise<DeletePublicationChannelsResult> {
  const igMediaId = nonEmpty(input.igMediaId);
  const fbPostId = nonEmpty(input.fbPostId);
  const outcomes: RemoteDeleteOutcome[] = [];
  const deleted: RemoteChannel[] = [];

  if (igMediaId !== null) {
    const outcome = await (input.deleteMediaFn ?? deleteMedia)({
      ...input.meta,
      mediaId: igMediaId,
    });
    outcomes.push(outcome);
    if (outcome.kind === "deleted") deleted.push("instagram");
  }

  if (fbPostId !== null) {
    const outcome = await (input.deleteFacebookPostFn ?? deleteFacebookPost)({
      ...input.meta,
      postId: fbPostId,
    });
    outcomes.push(outcome);
    if (outcome.kind === "deleted") deleted.push("facebook");
  }

  return {
    kind: outcomes.every((outcome) => outcome.kind === "deleted") ? "complete" : "partial",
    outcomes,
    deleted,
  };
}

export interface DeleteEventPublicationsInput {
  db: PublicationCleanupDb;
  eventId: string;
  meta: MetaPublishConfig | null;
  now?: Date;
  limit?: number;
  deleteMediaFn?: DeleteMediaFn;
  deleteFacebookPostFn?: DeleteFacebookPostFn;
}

export interface DeleteEventPublicationsResult {
  /** Objetos remotos apagados (ou já ausentes). */
  removed: number;
  /** Linhas locais totalmente limpas (apagadas/marcadas). */
  rowsDeleted: number;
  /** Linhas que ainda têm canal pendente. */
  pending: number;
  /** Publicações do navegador/legado que exigem remoção manual (sem API). */
  manualRemoval?: ManualRemovalRef[];
}

function stateOfRow(table: PublicationTable, row: PublicationRow): PublicationState {
  return table === "prospect_posts"
    ? stateFromPublicationColumn(row.publication)
    : stateFromImageParams(row.image_params);
}

async function affectedRows(query: PublicationMutationQuery): Promise<{
  error: { code?: string; message?: string } | null;
  affected: boolean;
}> {
  const result = typeof query.select === "function" ? await query.select("id") : await query;
  if (result.error !== null) return { error: result.error, affected: false };
  // Sem lista de linhas afetadas não há confirmação: falha fechada.
  if (result.data === null) return { error: null, affected: false };
  return { error: null, affected: result.data.length > 0 };
}

async function deleteRowLocal(
  table: PublicationTable,
  row: PublicationRow,
  db: PublicationCleanupDb,
  now: Date,
): Promise<boolean> {
  const client = db.from(table);
  if (
    publicationHasRefs({
      igMediaId: row.ig_media_id,
      fbPostId: row.fb_post_id,
      state: stateOfRow(table, row),
      error: row.error,
    })
  ) {
    return false;
  }
  const nowIso = nextVersionTimestamp(row.updated_at ?? null, now);
  if (table === "prospecting_posts") {
    if (client.delete === undefined) return false;
    let query = client.delete().eq("id", row.id);
    if (typeof row.updated_at === "string") query = query.eq("updated_at", row.updated_at);
    const result = await affectedRows(query);
    if (result.error !== null) {
      logger.warn(
        { table, rowId: row.id, code: result.error.code },
        "falha ao apagar linha de publicação do evento",
      );
      return false;
    }
    return result.affected;
  }

  if (client.update === undefined) return true;
  let query = client.update({ deleted_at: nowIso, updated_at: nowIso }).eq("id", row.id);
  if (typeof row.updated_at === "string") query = query.eq("updated_at", row.updated_at);
  const result = await affectedRows(query);
  if (result.error !== null) {
    logger.warn(
      { table, rowId: row.id, code: result.error.code },
      "falha ao marcar deleted_at do post de isca",
    );
    return false;
  }
  return result.affected;
}

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

/** Persiste imediatamente a remoção confirmada de UM canal (condicional). */
async function persistChannelRemoval(
  table: PublicationTable,
  row: PublicationRow,
  channel: RemoteChannel,
  db: PublicationCleanupDb,
): Promise<boolean> {
  const client = db.from(table);
  if (client.update === undefined) return false;
  const column = channel === "instagram" ? "ig_media_id" : "fb_post_id";
  const currentState = stateOfRow(table, row);
  const nextState = setChannelState(currentState, channel, { kind: "removed" });
  const nowIso = nextVersionTimestamp(row.updated_at ?? null, new Date());
  const base: Record<string, unknown> = { [column]: null, updated_at: nowIso };
  const withState: Record<string, unknown> =
    table === "prospecting_posts"
      ? { ...base, image_params: withPublicationState(row.image_params, nextState) }
      : { ...base, publication: nextState };

  const run = async (values: Record<string, unknown>) => {
    let query = client.update!(values).eq("id", row.id);
    if (typeof row.updated_at === "string") query = query.eq("updated_at", row.updated_at);
    return affectedRows(query);
  };

  let result = await run(withState);
  if (result.error !== null && isMissingColumn(result.error)) {
    result = await run(base);
  }
  if (result.error !== null) {
    logger.warn(
      { table, rowId: row.id, channel, code: result.error.code },
      "falha ao persistir remoção confirmada do canal",
    );
    return false;
  }
  // 0 linhas = concorrente salvou um id/estado novo => conflito, mantém pending.
  if (!result.affected) return false;

  if (channel === "instagram") row.ig_media_id = null;
  else row.fb_post_id = null;
  if (table === "prospecting_posts") {
    row.image_params = withPublicationState(row.image_params, nextState);
  } else {
    row.publication = nextState;
  }
  row.updated_at = nowIso;
  return true;
}

export async function deleteEventPublications(
  input: DeleteEventPublicationsInput,
): Promise<DeleteEventPublicationsResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 500;
  let removed = 0;
  let rowsDeleted = 0;
  let pending = 0;
  const manualRemoval: ManualRemovalRef[] = [];
  const seen = new Set<string>();

  for (const table of ["prospecting_posts", "prospect_posts"] as const) {
    const rows: PublicationRow[] = [];
    const base = input.db.from(table).select("*").eq("event_id", input.eventId);
    const filtered =
      table === "prospect_posts" && typeof base.is === "function"
        ? base.is("deleted_at", null)
        : base;
    const canPaginate =
      typeof filtered.order === "function" && typeof filtered.range === "function";

    if (canPaginate) {
      let offset = 0;
      for (;;) {
        const { data, error } = await filtered.order!("id", { ascending: true }).range!(
          offset,
          offset + limit - 1,
        );
        if (error !== null) {
          throw new Error(`falha ao listar ${table} do evento (${error.code ?? "?"})`);
        }
        const page = data ?? [];
        rows.push(...page);
        if (page.length < limit) break;
        offset += limit;
      }
    } else {
      const { data, error } = await filtered.limit(limit);
      if (error !== null) {
        throw new Error(`falha ao listar ${table} do evento (${error.code ?? "?"})`);
      }
      rows.push(...(data ?? []));
    }

    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);

      const igMediaId = nonEmpty(row.ig_media_id);
      const fbPostId = nonEmpty(row.fb_post_id) ?? facebookIdFromImageParams(row.image_params);
      const manual = manualRemovalFromRow({
        igMediaId,
        error: row.error,
        imageParams: row.image_params,
      });
      const hasRefs = publicationHasRefs({
        igMediaId,
        fbPostId,
        state: stateOfRow(table, row),
        error: row.error,
      });

      if (!hasRefs && manual === null) {
        if (await deleteRowLocal(table, row, input.db, now)) rowsDeleted += 1;
        else pending += 1;
        continue;
      }

      // Estado in_flight/uncertain/published/manual sem id ainda é ref remota.
      if (hasRefs && igMediaId === null && fbPostId === null && manual === null) {
        pending += 1;
        logger.warn(
          { eventId: input.eventId, table, rowId: row.id },
          "publicação sem id mas com estado remoto pendente; linha mantida",
        );
        continue;
      }

      if (manual !== null) {
        if (input.meta !== null && fbPostId !== null) {
          const fbResult = await deletePublicationChannels({
            igMediaId: null,
            fbPostId,
            meta: input.meta,
            deleteMediaFn: input.deleteMediaFn,
            deleteFacebookPostFn: input.deleteFacebookPostFn,
          });
          removed += fbResult.deleted.length;
          if (fbResult.deleted.includes("facebook")) {
            await persistChannelRemoval(table, row, "facebook", input.db);
          }
        }
        manualRemoval.push({
          table,
          rowId: row.id,
          link: manual.permalink,
          reason: manual.reason,
        });
        pending += 1;
        logger.warn(
          { eventId: input.eventId, table, rowId: row.id, link: manual.permalink },
          "publicação exige remoção manual no Instagram; ids/links mantidos",
        );
        continue;
      }

      if (input.meta === null) {
        pending += 1;
        continue;
      }

      const result = await deletePublicationChannels({
        igMediaId,
        fbPostId,
        meta: input.meta,
        deleteMediaFn: input.deleteMediaFn,
        deleteFacebookPostFn: input.deleteFacebookPostFn,
      });
      removed += result.deleted.length;

      let persistenceFailed = false;
      for (const channel of result.deleted) {
        const persisted = await persistChannelRemoval(table, row, channel, input.db);
        if (!persisted) persistenceFailed = true;
      }

      if (result.kind !== "complete" || persistenceFailed) {
        pending += 1;
        logger.warn(
          {
            eventId: input.eventId,
            table,
            rowId: row.id,
            outcomes: result.outcomes.map((outcome) => outcome.kind),
          },
          "limpeza de publicação parcial: refs restantes mantidas para retry",
        );
        continue;
      }

      if (
        publicationHasRefs({
          igMediaId: row.ig_media_id,
          fbPostId: row.fb_post_id,
          state: stateOfRow(table, row),
          error: row.error,
        })
      ) {
        pending += 1;
        continue;
      }
      if (await deleteRowLocal(table, row, input.db, now)) rowsDeleted += 1;
      else pending += 1;
    }
  }

  return {
    removed,
    rowsDeleted,
    pending,
    ...(manualRemoval.length > 0 ? { manualRemoval } : {}),
  };
}

/** Alias semântico usado pelos fluxos de encerramento/exclusão. */
export const cleanupEventPublications = deleteEventPublications;
