import "server-only";

import { logger } from "@/lib/logger";
import type { MetaPublishConfig } from "@/lib/meta/publishing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { manualRemovalFromRow } from "./browser-publication";
import {
  publicationHasRefs,
  setChannelState,
  stateFromPublicationColumn,
  type PublicationState,
} from "./publication-state";
import { ORPHAN_POST_TTL_MS, shouldDeletePost } from "./delete-policy";
import { nextVersionTimestamp } from "./version-timestamp";
import {
  deletePublicationChannels,
  type DeleteFacebookPostFn,
  type DeleteMediaFn,
} from "./delete-publications";

/**
 * Varre os posts de isca publicados e apaga no Instagram e na Página do
 * Facebook aqueles cuja prospecção terminou (evento completed/canceled), cujos
 * @ marcados já contataram todos, ou, sem evento, após o TTL.
 *
 * Idempotente: só considera `status='published'` com `deleted_at IS NULL`.
 * Em falha parcial de um canal, a linha NÃO é marcada — os ids continuam
 * disponíveis para o próximo sweep terminar.
 */

export interface DeleteProspectPostsInput {
  meta: MetaPublishConfig;
  now?: Date;
  orphanTtlMs?: number;
  limit?: number;
  deleteMediaFn?: DeleteMediaFn;
  deleteFacebookPostFn?: DeleteFacebookPostFn;
}

interface PostRow {
  id: string;
  ig_media_id: string | null;
  fb_post_id?: string | null;
  error?: string | null;
  publication?: unknown;
  updated_at?: string | null;
  event_id: string | null;
  created_at: string;
  tagged_handles?: string[] | null;
  contacted_handles?: string[] | null;
}

interface EventRow {
  id: string;
  status: string;
}

interface PostUpdateQuery extends PromiseLike<{ error: { code?: string } | null }> {
  eq(column: string, value: string): PostUpdateQuery;
  select(columns: string): Promise<{
    data: { id: string }[] | null;
    error: { code?: string } | null;
  }>;
}

interface PostQuery {
  select(columns: string): PostQuery;
  eq(column: string, value: unknown): PostQuery;
  is(column: string, value: null): PostQuery;
  limit(n: number): PostQuery;
  update(values: Record<string, unknown>): PostUpdateQuery;
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

async function updateBaitPost(
  db: DeleteDb,
  postId: string,
  expectedUpdatedAt: string | null | undefined,
  values: Record<string, unknown>,
): Promise<boolean> {
  let query = db.from("prospect_posts").update(values).eq("id", postId);
  if (typeof expectedUpdatedAt === "string") {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data, error } = await query.select("id");
  if (error !== null || data === null || data.length === 0) return false;
  return true;
}

export async function deleteFinishedProspectPosts(
  input: DeleteProspectPostsInput,
  db: DeleteDb = getSupabaseAdmin() as unknown as DeleteDb,
): Promise<number> {
  const now = input.now ?? new Date();
  const orphanTtlMs = input.orphanTtlMs ?? ORPHAN_POST_TTL_MS;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const { data: posts, error: listError } = await db
    .from("prospect_posts")
    .select(
      "id,ig_media_id,fb_post_id,error,publication,event_id,created_at,tagged_handles,contacted_handles",
    )
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(limit);

  if (listError !== null) {
    logger.warn({ code: listError.code }, "deleteFinishedProspectPosts: falha ao listar posts");
    return 0;
  }

  const candidates = (posts ?? []).filter(
    (post) => post.ig_media_id !== null || (post.fb_post_id ?? null) !== null,
  );
  if (candidates.length === 0) return 0;

  const eventIds = [
    ...new Set(candidates.map((post) => post.event_id).filter((id): id is string => id !== null)),
  ];
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
    if (
      !shouldDeletePost({
        eventStatus,
        createdAt: new Date(post.created_at),
        now,
        orphanTtlMs,
        taggedHandles: post.tagged_handles ?? [],
        contactedHandles: post.contacted_handles ?? [],
      })
    ) {
      continue;
    }

    const manual = manualRemovalFromRow({
      igMediaId: post.ig_media_id,
      error: post.error,
      imageParams: null,
    });
    if (manual !== null) {
      // O Facebook ainda pode sair pela API; o Instagram fica aguardando ação manual.
      if ((post.fb_post_id ?? null) !== null) {
        const fbResult = await deletePublicationChannels({
          igMediaId: null,
          fbPostId: post.fb_post_id ?? null,
          meta: input.meta,
          deleteMediaFn: input.deleteMediaFn,
          deleteFacebookPostFn: input.deleteFacebookPostFn,
        });
        if (fbResult.deleted.includes("facebook")) {
          const state = setChannelState(stateFromPublicationColumn(post.publication), "facebook", {
            kind: "removed",
          });
          await updateBaitPost(db, post.id, post.updated_at, {
            fb_post_id: null,
            publication: state,
            updated_at: nextVersionTimestamp(post.updated_at ?? null, now),
          });
        }
      }
      logger.warn(
        { postId: post.id, link: manual.permalink },
        "post de isca publicado pelo navegador: remoção manual necessária; linha mantida",
      );
      continue;
    }

    const result = await deletePublicationChannels({
      igMediaId: post.ig_media_id,
      fbPostId: post.fb_post_id ?? null,
      meta: input.meta,
      deleteMediaFn: input.deleteMediaFn,
      deleteFacebookPostFn: input.deleteFacebookPostFn,
    });
    let nextState: PublicationState = stateFromPublicationColumn(post.publication);
    for (const channel of result.deleted) {
      nextState = setChannelState(nextState, channel, { kind: "removed" });
    }
    if (result.deleted.length > 0) {
      const persisted = await updateBaitPost(db, post.id, post.updated_at, {
        publication: nextState,
        ig_media_id: result.deleted.includes("instagram") ? null : post.ig_media_id,
        fb_post_id: result.deleted.includes("facebook") ? null : (post.fb_post_id ?? null),
        updated_at: nextVersionTimestamp(post.updated_at ?? null, now),
      });
      if (!persisted) {
        logger.warn({ postId: post.id }, "conflito ao persistir remoção do post de isca");
        continue;
      }
    }

    if (
      publicationHasRefs({
        igMediaId: result.deleted.includes("instagram") ? null : post.ig_media_id,
        fbPostId: result.deleted.includes("facebook") ? null : post.fb_post_id,
        state: nextState,
        error: post.error,
      })
    ) {
      logger.warn(
        { postId: post.id, state: nextState },
        "post de isca ainda tem ref remota; linha mantida",
      );
      continue;
    }

    if (result.kind !== "complete") {
      logger.warn(
        { postId: post.id, outcomes: result.outcomes.map((outcome) => outcome.kind) },
        "deleteFinishedProspectPosts: falha parcial; refs mantidas para retry",
      );
      continue;
    }

    const marked = await updateBaitPost(db, post.id, post.updated_at, {
      deleted_at: now.toISOString(),
    });
    if (!marked) {
      logger.warn(
        { postId: post.id },
        "deleteFinishedProspectPosts: conflito ao marcar deleted_at",
      );
      continue;
    }
    deleted += 1;
  }

  return deleted;
}
