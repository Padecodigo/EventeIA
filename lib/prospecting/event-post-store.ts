import "server-only";

import type { Json } from "@/lib/supabase/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  buildEventPostContent,
  type EventPostImageParams,
  type EventPostSource,
} from "./event-post";
import { nextVersionTimestamp } from "./version-timestamp";
import {
  LEGACY_MANUAL_REMOVAL_PREFIX,
  initialPublicationState,
  sameChannelState,
  stateFromImageParams,
  withPublicationState,
  type PublicationState,
} from "./publication-state";

/**
 * Persistência dos posts de prospecção por evento (`prospecting_posts`).
 * O client é acessado por uma interface mínima injetável para permitir testes
 * sem Supabase/Redis reais — o mesmo padrão de `lib/outreach`.
 */

export type ProspectingPostStatus =
  "draft" | "pending_approval" | "approved" | "published" | "failed";

export interface ProspectingPostRecord {
  id: string;
  eventId: string;
  eventCode: string;
  eventType: string;
  eventDate: string;
  city: string | null;
  region: string | null;
  caption: string;
  imageUrl: string | null;
  imageParams: EventPostImageParams;
  status: ProspectingPostStatus;
  igMediaId: string | null;
  /** Id do post da Página do Facebook (publicação cruzada). */
  fbPostId: string | null;
  publicationState: PublicationState;
  updatedAt: string | null;
  error: string | null;
  publishedAt: string | null;
}

export class PublicationConflictError extends Error {
  constructor(message = "post de prospecção alterado por outra publicação; tente novamente") {
    super(message);
    this.name = "PublicationConflictError";
  }
}

export type SavePublicationStateResult =
  | { kind: "saved" }
  | { kind: "conflict"; error: string }
  | { kind: "failed"; error: string }
  | { kind: "migration_required"; missing: string[] };

export interface UpsertProspectingPostInput extends EventPostSource {
  imageUrl?: string | null;
  status?: ProspectingPostStatus;
}

export interface ProspectingPostStatusPatch {
  status?: ProspectingPostStatus;
  publishedAt?: string | null;
  error?: string | null;
  imageUrl?: string | null;
  /** Estado lido pelo chamador; conflito se a linha já mudou. */
  expectedPublicationState?: PublicationState;
}

export type UpdateStatusResult =
  { kind: "saved" } | { kind: "conflict"; error: string } | { kind: "failed"; error: string };

export interface ProspectingPostStore {
  findByEvent(eventId: string): Promise<ProspectingPostRecord | null>;
  findById(id: string): Promise<ProspectingPostRecord | null>;
  findByCode(code: string): Promise<ProspectingPostRecord | null>;
  findEventIdByCode(code: string): Promise<string | null>;
  upsert(input: UpsertProspectingPostInput): Promise<ProspectingPostRecord>;
  updateStatus(id: string, patch: ProspectingPostStatusPatch): Promise<UpdateStatusResult>;
  savePublicationState?(
    id: string,
    state: PublicationState,
    expected?: PublicationState,
  ): Promise<SavePublicationStateResult>;
}

interface ProspectingPostRow {
  id: string;
  event_id: string;
  event_code: string;
  event_type: string;
  event_date: string;
  city: string | null;
  region: string | null;
  caption: string;
  image_url: string | null;
  image_params: Json;
  status: ProspectingPostStatus;
  ig_media_id: string | null;
  fb_post_id?: string | null;
  error: string | null;
  published_at: string | null;
  updated_at?: string | null;
}

interface UpdateQuery extends PromiseLike<{ error: { code?: string; message?: string } | null }> {
  eq(column: string, value: string): UpdateQuery;
  select(columns: string): Promise<{
    data: ProspectingPostRow[] | null;
    error: { code?: string; message?: string } | null;
  }>;
}

interface ProspectingPostDb {
  from(table: "prospecting_posts"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{ data: ProspectingPostRow | null }>;
      };
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{
          data: ProspectingPostRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
    update(values: Record<string, unknown>): UpdateQuery;
  };
}

// `*` mantém o código tolerante antes da migração de `fb_post_id`: a coluna só
// aparece quando existir e o id do Facebook também é guardado em image_params.
const SELECT_COLUMNS = "*";

interface PublicationMetadata {
  igMediaId?: string | null;
  fbPostId?: string | null;
}

function publicationFromImageParams(value: Json | null | undefined): PublicationMetadata | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value))
    return null;
  const publication = (value as { publication?: unknown }).publication;
  if (
    publication === null ||
    publication === undefined ||
    typeof publication !== "object" ||
    Array.isArray(publication)
  ) {
    return null;
  }
  return publication;
}

function toRecord(row: ProspectingPostRow): ProspectingPostRecord {
  const publication = publicationFromImageParams(row.image_params);
  return {
    id: row.id,
    eventId: row.event_id,
    eventCode: row.event_code,
    eventType: row.event_type,
    eventDate: row.event_date,
    city: row.city,
    region: row.region,
    caption: row.caption,
    imageUrl: row.image_url,
    imageParams: row.image_params as unknown as EventPostImageParams,
    status: row.status,
    igMediaId: row.ig_media_id ?? publication?.igMediaId ?? null,
    fbPostId: row.fb_post_id ?? publication?.fbPostId ?? null,
    publicationState: stateFromImageParams(row.image_params),
    updatedAt: row.updated_at ?? null,
    error: row.error,
    publishedAt: row.published_at,
  };
}

export function createSupabaseProspectingPostStore(
  db: ProspectingPostDb = getSupabaseAdmin() as unknown as ProspectingPostDb,
): ProspectingPostStore {
  async function findBy(column: string, value: string): Promise<ProspectingPostRecord | null> {
    const { data } = await db
      .from("prospecting_posts")
      .select(SELECT_COLUMNS)
      .eq(column, value)
      .maybeSingle();
    return data === null ? null : toRecord(data);
  }

  return {
    findByEvent: (eventId) => findBy("event_id", eventId),
    findById: (id) => findBy("id", id),
    findByCode: (code) => findBy("event_code", code.trim().toUpperCase()),

    async findEventIdByCode(code) {
      const post = await findBy("event_code", code.trim().toUpperCase());
      return post?.eventId ?? null;
    },

    async upsert(input) {
      const content = buildEventPostContent(input);
      const existing = await findBy("event_id", input.eventId);

      if (existing === null) {
        const inserted = await db
          .from("prospecting_posts")
          .insert({
            event_id: input.eventId,
            event_code: content.eventCode,
            event_type: input.eventType,
            event_date: input.eventDate,
            city: input.city ?? null,
            region: input.region ?? null,
            caption: content.caption,
            image_url: input.imageUrl ?? null,
            image_params: withPublicationState(content.imageParams, initialPublicationState()),
            status: input.status ?? "draft",
            updated_at: nextVersionTimestamp(null, new Date()),
          })
          .select(SELECT_COLUMNS)
          .single();
        if (inserted.error?.code === "23505") {
          // Corrida de inserção: NUNCA sobrescreve a linha vencedora.
          const raced = await findBy("event_id", input.eventId);
          if (raced === null) throw new Error("falha ao salvar post de prospecção do evento");
          return raced;
        }
        if (inserted.error !== null || inserted.data === null) {
          throw new Error("falha ao salvar post de prospecção do evento");
        }
        return toRecord(inserted.data);
      }

      if (existing.updatedAt === null) {
        throw new PublicationConflictError("updated_at ausente; não é seguro regenerar");
      }
      // SEMPRE preserva o estado/ids de publicação existentes; só o conteúdo
      // editorial é regenerado. CAS impede perder claim in_flight concorrente.
      const updated = await db
        .from("prospecting_posts")
        .update({
          event_code: content.eventCode,
          event_type: input.eventType,
          event_date: input.eventDate,
          city: input.city ?? null,
          region: input.region ?? null,
          caption: content.caption,
          image_url: input.imageUrl ?? null,
          image_params: withPublicationState(content.imageParams, existing.publicationState),
          ig_media_id: existing.igMediaId,
          status: input.status ?? "draft",
          updated_at: nextVersionTimestamp(existing.updatedAt, new Date()),
        })
        .eq("id", existing.id)
        .eq("updated_at", existing.updatedAt)
        .select(SELECT_COLUMNS);
      if (updated.error !== null) {
        throw new Error(`falha ao salvar post de prospecção (${updated.error.code ?? "?"})`);
      }
      if (updated.data === null || updated.data.length === 0) {
        throw new PublicationConflictError();
      }
      return toRecord(updated.data[0]);
    },

    async savePublicationState(id, state, expected) {
      // Claim condicional: só grava se o estado atual do(s) canal(is) alterado(s)
      // ainda é o estado de onde o chamador partiu.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await findBy("id", id);
        if (current === null) return { kind: "failed", error: "post não encontrado" };
        if (current.updatedAt === null) {
          return { kind: "failed", error: "updated_at ausente para controle de concorrência" };
        }
        if (expected !== undefined) {
          const changed = (["instagram", "facebook"] as const).filter(
            (channel) => !sameChannelState(state[channel], expected[channel]),
          );
          const conflict = changed.some(
            (channel) => !sameChannelState(current.publicationState[channel], expected[channel]),
          );
          if (conflict) {
            return { kind: "conflict", error: "estado do canal mudou desde a leitura" };
          }
        }
        const status: ProspectingPostStatus =
          state.instagram.kind === "published" && state.facebook.kind === "published"
            ? "published"
            : state.instagram.kind === "manual_removal"
              ? "published"
              : "failed";
        const igMediaId =
          state.instagram.kind === "published"
            ? state.instagram.id
            : state.instagram.kind === "removed"
              ? null
              : undefined;
        const { data, error } = await db
          .from("prospecting_posts")
          .update({
            image_params: withPublicationState(current.imageParams, state),
            status,
            ...(igMediaId !== undefined ? { ig_media_id: igMediaId } : {}),
            updated_at: nextVersionTimestamp(current.updatedAt, new Date()),
          })
          .eq("id", id)
          .eq("updated_at", current.updatedAt)
          .select("id");
        if (error !== null) {
          return { kind: "failed", error: `falha ao salvar estado (${error.code ?? "?"})` };
        }
        if (data !== null && data.length > 0) return { kind: "saved" };
      }
      return { kind: "failed", error: "conflito ao salvar estado da publicação" };
    },

    async updateStatus(id, patch) {
      // Ids/estado de canal são responsabilidade exclusiva de savePublicationState.
      // Aqui só atualizamos campos simples, com CAS no updated_at e estado esperado.
      const current = await findBy("id", id);
      if (current === null) return { kind: "failed", error: "post não encontrado" };
      if (current.updatedAt === null) {
        return { kind: "failed", error: "updated_at ausente para controle de concorrência" };
      }
      if (patch.expectedPublicationState !== undefined) {
        const expected = patch.expectedPublicationState;
        if (
          !sameChannelState(current.publicationState.instagram, expected.instagram) ||
          !sameChannelState(current.publicationState.facebook, expected.facebook)
        ) {
          return { kind: "conflict", error: "estado da publicação mudou desde a leitura" };
        }
      }
      const preserveLegacyManualError = (current.error ?? "").startsWith(
        LEGACY_MANUAL_REMOVAL_PREFIX,
      );
      const values: Record<string, unknown> = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.publishedAt !== undefined ? { published_at: patch.publishedAt } : {}),
        ...(patch.error !== undefined && !preserveLegacyManualError ? { error: patch.error } : {}),
        ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
        updated_at: nextVersionTimestamp(current.updatedAt, new Date()),
      };
      const { data, error } = await db
        .from("prospecting_posts")
        .update(values)
        .eq("id", id)
        .eq("updated_at", current.updatedAt)
        .select("id");
      if (error !== null) {
        return {
          kind: "failed",
          error: `falha ao atualizar post de prospecção (${error.code ?? "?"})`,
        };
      }
      if (data === null || data.length === 0) {
        return { kind: "conflict", error: "concorrência: updated_at mudou durante a atualização" };
      }
      return { kind: "saved" };
    },
  };
}
