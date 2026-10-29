import "server-only";

import { logger } from "@/lib/logger";
import { deleteMedia, type MetaPublishConfig } from "@/lib/meta/publishing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { ORPHAN_POST_TTL_MS, shouldDeletePost } from "./delete-policy";

/**
 * Varre os posts de isca publicados e apaga no Instagram aqueles cuja
 * prospecção terminou (evento completed/canceled) ou, sem evento, após o TTL.
 * Idempotente: só considera `status='published'` com `deleted_at IS NULL`.
 */

export interface DeleteProspectPostsInput {
  meta: MetaPublishConfig;
  now?: Date;
  orphanTtlMs?: number;
  limit?: number;
}

interface PostRow {
  id: string;
  ig_media_id: string | null;
  event_id: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  status: string;
}

interface PostQuery {
  select(columns: string): PostQuery;
  eq(column: string, value: unknown): PostQuery;
  is(column: string, value: null): PostQuery;
  not(column: string, operator: string, value: null): PostQuery;
  limit(n: number): PostQuery;
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<{ error: { code?: string } | null }>;
  };
  then(
    resolve: (result: { data: PostRow[] | null; error: { code?: string } | null }) => unknown,
  ): Promise<unknown>;
}

interface EventQuery {
  select(columns: string): EventQuery;
  in(column: string, values: string[]): EventQuery;
  then(
    resolve: (result: { data: EventRow[] | null; error: { code?: string } | null }) => unknown,
  ): Promise<unknown>;
}

interface DeleteDb {
  from(table: "prospect_posts"): PostQuery;
  from(table: "events"): EventQuery;
}

const DEFAULT_LIMIT = 100;

export async function deleteFinishedProspectPosts(
  input: DeleteProspectPostsInput,
  db: DeleteDb = getSupabaseAdmin() as unknown as DeleteDb,
): Promise<number> {
  const now = input.now ?? new Date();
  const orphanTtlMs = input.orphanTtlMs ?? ORPHAN_POST_TTL_MS;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const { data: posts, error: listError } = await db
    .from("prospect_posts")
    .select("id,ig_media_id,event_id,created_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .not("ig_media_id", "is", null)
    .limit(limit);

  if (listError !== null) {
    logger.warn({ code: listError.code }, "deleteFinishedProspectPosts: falha ao listar posts");
    return 0;
  }

  const candidates = (posts ?? []).filter((post) => post.ig_media_id !== null);
  if (candidates.length === 0) return 0;

  const eventIds = [...new Set(candidates.map((post) => post.event_id).filter((id): id is string => id !== null))];
  const statusByEvent = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await db.from("events").select("id,status").in("id", eventIds);
    for (const event of events ?? []) {
      statusByEvent.set(event.id, event.status);
    }
  }

  let deleted = 0;
  for (const post of candidates) {
    const eventStatus = post.event_id !== null ? (statusByEvent.get(post.event_id) ?? null) : null;
    if (!shouldDeletePost({ eventStatus, createdAt: new Date(post.created_at), now, orphanTtlMs })) {
      continue;
    }

    const result = await deleteMedia({ ...input.meta, mediaId: post.ig_media_id as string });
    if (!result.ok) {
      logger.warn(
        { mediaId: post.ig_media_id, reason: result.error },
        "deleteFinishedProspectPosts: falha ao excluir mídia no Instagram",
      );
      continue;
    }

    const { error: updateError } = await db
      .from("prospect_posts")
      .update({ deleted_at: now.toISOString() })
      .eq("id", post.id);
    if (updateError !== null) {
      logger.warn({ code: updateError.code }, "deleteFinishedProspectPosts: falha ao marcar deleted_at");
      continue;
    }
    deleted += 1;
  }

  return deleted;
}
