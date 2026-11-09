import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { PlannedPost } from "./publish-plan";
import { nextVersionTimestamp } from "./version-timestamp";
import {
  initialPublicationState,
  publicationStateFromLegacy,
  sameChannelState,
  stateFromImageParams,
  type PublicationState,
} from "./publication-state";

/**
 * Porta de persistência dos posts em `prospect_posts`.
 *
 * O fluxo de produção reserva UMA linha durável ANTES de qualquer chamada
 * remota e persiste o estado por canal. Sem as colunas propostas
 * (`fb_post_id`, `publication` jsonb), o fluxo falha fechado.
 */

export type PostStatus = "draft" | "pending_approval" | "approved" | "published" | "failed";

export interface RecordPostInput {
  planned: PlannedPost;
  status: PostStatus;
  imageUrl?: string;
  igMediaId?: string;
  fbPostId?: string;
  error?: string;
  eventId?: string;
  imageExpiresAt?: Date;
}

export type PostPersistenceProbe =
  | { kind: "ready" }
  | { kind: "migration_required"; missing: string[] }
  | { kind: "failed"; error: string };

export interface BaitReservation {
  id: string;
  state: PublicationState;
  status: PostStatus;
}

export type ReservePostResult =
  | { kind: "reserved"; reservation: BaitReservation }
  | { kind: "migration_required"; missing: string[] }
  | { kind: "failed"; error: string };

export type SavePostStateResult =
  | { kind: "saved" }
  | { kind: "conflict"; error: string }
  | { kind: "migration_required"; missing: string[] }
  | { kind: "failed"; error: string };

export interface ReservePostInput {
  planned: PlannedPost;
  eventId: string;
  imageUrl: string;
  imageExpiresAt?: Date;
}

export interface PostStore {
  record(input: RecordPostInput): Promise<void>;
  probe?(): Promise<PostPersistenceProbe>;
  reserve?(input: ReservePostInput): Promise<ReservePostResult>;
  saveState?(
    id: string,
    state: PublicationState,
    status: PostStatus,
    expected?: PublicationState,
  ): Promise<SavePostStateResult>;
}

interface DbError {
  code?: string;
  message?: string;
}

interface ExistingRow {
  id: string;
  ig_media_id?: string | null;
  fb_post_id?: string | null;
  publication?: unknown;
  status?: PostStatus;
  updated_at?: string | null;
}

interface PostDb {
  from(table: "prospect_posts"): {
    select(columns: string): {
      limit(n: number): Promise<{ data: Record<string, unknown>[] | null; error: DbError | null }>;
      eq(column: string, value: unknown): PostSelectQuery;
    };
    insert(values: Record<string, unknown>): PromiseLike<{ error: DbError | null }> & {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: DbError | null }>;
      };
    };
    update(values: Record<string, unknown>): PostUpdateQuery;
  };
}

interface PostUpdateQuery extends PromiseLike<{ error: DbError | null }> {
  eq(column: string, value: string): PostUpdateQuery;
  select(columns: string): Promise<{ data: { id: string }[] | null; error: DbError | null }>;
}

interface PostSelectQuery extends PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: DbError | null;
}> {
  eq(column: string, value: unknown): PostSelectQuery;
  contains(column: string, value: string[]): PostSelectQuery;
  order(column: string, options: { ascending: boolean }): PostSelectQuery;
  limit(n: number): {
    maybeSingle(): Promise<{ data: ExistingRow | null; error: DbError | null }>;
    then?: unknown;
  };
  maybeSingle(): Promise<{ data: ExistingRow | null; error: DbError | null }>;
}

function missingColumns(error: DbError): string[] {
  const message = (error.message ?? "").toLowerCase();
  const missing: string[] = [];
  if (message.includes("fb_post_id")) missing.push("fb_post_id");
  if (message.includes("publication")) missing.push("publication");
  if (missing.length === 0 && (error.code === "42703" || error.code === "PGRST204")) {
    return ["fb_post_id/publication"];
  }
  return missing;
}

function isMissingColumn(error: DbError): boolean {
  return missingColumns(error).length > 0;
}

/** @ marcados normalizados (minúsculos, sem @, sem duplicata). */
export function normalizeHandles(handles: readonly string[] | undefined): string[] {
  const out = new Set<string>();
  for (const h of handles ?? []) {
    const n = h.trim().replace(/^@+/, "").toLowerCase();
    if (n.length > 0) out.add(n);
  }
  return [...out];
}

function stateFromRow(row: ExistingRow): PublicationState {
  const fromJson = stateFromImageParams(row.publication);
  if (fromJson.instagram.kind !== "pending" || fromJson.facebook.kind !== "pending") {
    return fromJson;
  }
  return publicationStateFromLegacy({
    igMediaId: row.ig_media_id ?? null,
    fbPostId: row.fb_post_id ?? null,
  });
}

export function createSupabasePostStore(
  db: PostDb = getSupabaseAdmin() as unknown as PostDb,
): PostStore {
  return {
    async probe() {
      const { error } = await db
        .from("prospect_posts")
        .select("id,fb_post_id,publication")
        .limit(1);
      if (error === null) return { kind: "ready" };
      if (isMissingColumn(error)) {
        return { kind: "migration_required", missing: missingColumns(error) };
      }
      return { kind: "failed", error: `falha ao verificar schema (${error.code ?? "?"})` };
    },

    async reserve(input) {
      const existing = await db
        .from("prospect_posts")
        .select("id,ig_media_id,fb_post_id,publication,status")
        .eq("event_id", input.eventId)
        .eq("day_index", input.planned.dayIndex)
        .contains("categories", [input.planned.category])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error !== null) {
        if (isMissingColumn(existing.error)) {
          return { kind: "migration_required", missing: missingColumns(existing.error) };
        }
        return { kind: "failed", error: `falha ao reservar post (${existing.error.code ?? "?"})` };
      }
      if (existing.data !== null) {
        return {
          kind: "reserved",
          reservation: {
            id: existing.data.id,
            state: stateFromRow(existing.data),
            status: existing.data.status ?? "approved",
          },
        };
      }

      const { data, error } = await db
        .from("prospect_posts")
        .insert({
          caption: input.planned.caption,
          image_url: input.imageUrl,
          categories: [input.planned.category],
          day_index: input.planned.dayIndex,
          status: "approved",
          ig_media_id: null,
          fb_post_id: null,
          publication: initialPublicationState(),
          event_id: input.eventId,
          image_expires_at: input.imageExpiresAt?.toISOString() ?? null,
          tagged_handles: normalizeHandles(input.planned.handles),
        })
        .select("id")
        .single();
      if (error !== null || data === null) {
        if (error !== null && isMissingColumn(error)) {
          return { kind: "migration_required", missing: missingColumns(error) };
        }
        // Corrida de reserva: outra worker inseriu a mesma chave única.
        if (error?.code === "23505") {
          const raced = await db
            .from("prospect_posts")
            .select("id,ig_media_id,fb_post_id,publication,status")
            .eq("event_id", input.eventId)
            .eq("day_index", input.planned.dayIndex)
            .contains("categories", [input.planned.category])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (raced.error === null && raced.data !== null) {
            return {
              kind: "reserved",
              reservation: {
                id: raced.data.id,
                state: stateFromRow(raced.data),
                status: raced.data.status ?? "approved",
              },
            };
          }
        }
        return { kind: "failed", error: `falha ao reservar post (${error?.code ?? "?"})` };
      }
      return {
        kind: "reserved",
        reservation: { id: data.id, state: initialPublicationState(), status: "approved" },
      };
    },

    async saveState(id, state, status, expected) {
      const current = await db
        .from("prospect_posts")
        .select("publication,updated_at")
        .eq("id", id)
        .maybeSingle();
      if (current.error !== null || current.data === null) {
        return {
          kind: "failed",
          error: `falha ao ler estado atual (${current.error?.code ?? "?"})`,
        };
      }
      const currentState = stateFromImageParams(current.data.publication);
      if (expected !== undefined) {
        const changed = (["instagram", "facebook"] as const).filter(
          (channel) => !sameChannelState(state[channel], expected[channel]),
        );
        if (
          changed.some((channel) => !sameChannelState(currentState[channel], expected[channel]))
        ) {
          return { kind: "conflict", error: "estado do canal mudou desde a leitura" };
        }
      }
      if (typeof current.data.updated_at !== "string") {
        return { kind: "failed", error: "updated_at ausente para controle de concorrência" };
      }
      const igId = state.instagram.kind === "published" ? state.instagram.id : null;
      const fbId = state.facebook.kind === "published" ? state.facebook.id : null;
      const { data, error } = await db
        .from("prospect_posts")
        .update({
          publication: state,
          status,
          ig_media_id: igId,
          fb_post_id: fbId,
          updated_at: nextVersionTimestamp(current.data.updated_at, new Date()),
        })
        .eq("id", id)
        .eq("updated_at", current.data.updated_at)
        .select("id");
      if (error !== null) {
        if (isMissingColumn(error)) {
          return { kind: "migration_required", missing: missingColumns(error) };
        }
        return { kind: "failed", error: `falha ao salvar estado (${error.code ?? "?"})` };
      }
      if (data === null || data.length === 0) {
        return { kind: "conflict", error: "claim concorrente perdeu a corrida" };
      }
      return { kind: "saved" };
    },

    async record(input) {
      const values: Record<string, unknown> = {
        caption: input.planned.caption,
        image_url: input.imageUrl ?? null,
        categories: [input.planned.category],
        day_index: input.planned.dayIndex,
        status: input.status,
        ig_media_id: input.igMediaId ?? null,
        error: input.error ?? null,
        event_id: input.eventId ?? null,
        image_expires_at: input.imageExpiresAt?.toISOString() ?? null,
        tagged_handles: normalizeHandles(input.planned.handles),
        ...(input.fbPostId !== undefined ? { fb_post_id: input.fbPostId } : {}),
      };
      const result = await db.from("prospect_posts").insert(values);
      if (result.error !== null) {
        throw new Error(`falha ao registrar post (${result.error.code ?? "?"})`);
      }
    },
  };
}

/** Interface mínima para buscar a imagem já gerada de um evento + necessidade. */
interface PostLookupDb {
  from(table: "prospect_posts"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        contains(
          column: string,
          value: string[],
        ): {
          gt(
            column: string,
            value: string,
          ): {
            order(
              column: string,
              options: { ascending: boolean },
            ): {
              limit(n: number): {
                maybeSingle(): Promise<{
                  data: { image_url: string | null; image_expires_at: string | null } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
}

/**
 * Consulta antiga de imagem por evento + necessidade.
 * A publicação não usa este retorno: cada post pede uma cena nova ao Flux.
 */
export interface CachedArt {
  url: string;
  expiresAt: Date;
}

/** Arte válida (não expirada) do mesmo evento + necessidade; null se não houver. */
export async function findImageFor(
  eventId: string,
  category: string,
  now: Date = new Date(),
  db: PostLookupDb = getSupabaseAdmin() as unknown as PostLookupDb,
): Promise<CachedArt | null> {
  const { data } = await db
    .from("prospect_posts")
    .select("image_url,image_expires_at")
    .eq("event_id", eventId)
    .contains("categories", [category])
    .gt("image_expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.image_url === null || data?.image_url === undefined) return null;
  if (data.image_expires_at === null || data.image_expires_at === undefined) return null;
  return { url: data.image_url, expiresAt: new Date(data.image_expires_at) };
}
