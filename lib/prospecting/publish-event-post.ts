import {
  publishToChannels,
  type ChannelPublicationIds,
  type MetaPublishConfig,
} from "@/lib/meta/publishing";

import type {
  ProspectingPostStatusPatch,
  ProspectingPostStore,
  UpdateStatusResult,
} from "./event-post-store";
import { canPublishForEvent, type EventPublicationState } from "./publish-guard";
import type { PublicationState } from "./publication-state";

/**
 * Publicação do post de prospecção aprovado por um humano.
 *
 * Publica nos DOIS canais (Instagram + Página do Facebook) quando a Página está
 * configurada e guarda o id remoto de cada canal. O retry é idempotente por
 * canal: ids já existentes são pulados e só o canal faltante é publicado.
 */

export type EventPostPublishFailure =
  | "approval_required"
  | "missing_image"
  | "container_failed"
  | "publish_failed"
  | "facebook_failed"
  | "event_closed"
  | "uncertain"
  | "persistence_failed";

export type EventPostPublishOutcome =
  | { kind: "published"; ok: true; mediaId: string; imageUrl: string; fbPostId?: string }
  | {
      kind: "failed" | EventPostPublishFailure;
      ok: false;
      reason: EventPostPublishFailure;
      error?: string;
      igMediaId?: string;
      fbPostId?: string;
    };

export interface PublishEventPostInput {
  post: {
    id: string;
    caption: string;
    imageUrl: string | null;
    /** Ids já publicados (retry só completa o canal que faltou). */
    igMediaId?: string | null;
    fbPostId?: string | null;
    publicationState?: PublicationState;
  };
  approved: boolean;
  meta: MetaPublishConfig;
  store: Pick<ProspectingPostStore, "updateStatus" | "savePublicationState">;
  /** Estado do evento no momento da publicação (bloqueia encerrado/excluído). */
  event?: EventPublicationState | null;
  /** Atalho para chamadores que só têm o status. */
  eventStatus?: string | null;
  /** Exige a Página do Facebook configurada (fluxo de evento). */
  requireFacebook?: boolean;
  recheckEvent?: () => Promise<EventPublicationState | null>;
  onEventClosed?: () => Promise<void>;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

async function patch(
  store: Pick<ProspectingPostStore, "updateStatus">,
  id: string,
  values: ProspectingPostStatusPatch,
): Promise<UpdateStatusResult> {
  return store.updateStatus(id, values);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function eventBlocked(input: PublishEventPostInput): boolean {
  if (input.event !== undefined) return !canPublishForEvent(input.event);
  if (input.eventStatus !== undefined) return !canPublishForEvent({ status: input.eventStatus });
  return false;
}

export async function publishEventPost(
  input: PublishEventPostInput,
): Promise<EventPostPublishOutcome> {
  const now = input.now ?? (() => new Date());
  const existing: ChannelPublicationIds = {
    igMediaId: input.post.igMediaId ?? null,
    fbPostId: input.post.fbPostId ?? null,
  };

  if (!input.approved) {
    await patch(input.store, input.post.id, {
      status: "pending_approval",
      expectedPublicationState: input.post.publicationState,
    });
    return { kind: "approval_required", ok: false, reason: "approval_required" };
  }

  if (eventBlocked(input)) {
    const error = "evento encerrado ou excluído";
    await patch(input.store, input.post.id, {
      status: "failed",
      error,
      expectedPublicationState: input.post.publicationState,
    });
    return { kind: "event_closed", ok: false, reason: "event_closed", error };
  }

  if (input.post.imageUrl === null || input.post.imageUrl.trim().length === 0) {
    const error = "post sem imagem da marca";
    await patch(input.store, input.post.id, {
      status: "failed",
      error,
      expectedPublicationState: input.post.publicationState,
    });
    return { kind: "missing_image", ok: false, reason: "missing_image", error };
  }

  const dual = await publishToChannels({
    ...input.meta,
    imageUrl: input.post.imageUrl,
    caption: input.post.caption,
    existing,
    initialState: input.post.publicationState,
    onState:
      input.store.savePublicationState === undefined
        ? undefined
        : async (state, previous) => {
            const saved = await input.store.savePublicationState!(input.post.id, state, previous);
            if (saved.kind === "saved") return { kind: "saved" as const };
            if (saved.kind === "conflict") {
              return { kind: "conflict" as const, error: saved.error };
            }
            if (saved.kind === "migration_required") {
              return { kind: "migration_required" as const, missing: saved.missing };
            }
            return { kind: "failed" as const, error: saved.error };
          },
    requireFacebook: input.requireFacebook,
    fetchImpl: input.fetchImpl,
  });

  if (input.recheckEvent !== undefined) {
    const after = await input.recheckEvent();
    if (after === null || !canPublishForEvent(after)) {
      if (input.onEventClosed !== undefined) await input.onEventClosed();
    }
  }

  const igId =
    dual.instagram.kind === "published"
      ? nonEmpty(dual.instagram.id)
      : nonEmpty(existing.igMediaId);
  const fbId =
    dual.facebook.kind === "published" ? nonEmpty(dual.facebook.id) : nonEmpty(existing.fbPostId);

  if (dual.kind === "uncertain") {
    if (input.store.savePublicationState === undefined) {
      await patch(input.store, input.post.id, {
        status: "failed",
        error: dual.error,
        expectedPublicationState: input.post.publicationState,
      });
    }
    return {
      kind: "uncertain",
      ok: false,
      reason: "uncertain",
      error: dual.error,
      ...(igId !== null ? { igMediaId: igId } : {}),
      ...(fbId !== null ? { fbPostId: fbId } : {}),
    };
  }

  if (dual.kind !== "published") {
    const reason: EventPostPublishFailure =
      dual.kind === "failed" && dual.instagram.kind === "failed"
        ? dual.instagram.stage === "container"
          ? "container_failed"
          : "publish_failed"
        : "facebook_failed";
    const error = dual.error;
    if (input.store.savePublicationState === undefined) {
      await patch(input.store, input.post.id, {
        status: "failed",
        error,
        expectedPublicationState: input.post.publicationState,
      });
    }
    return {
      kind: "failed",
      ok: false,
      reason,
      error,
      ...(igId !== null ? { igMediaId: igId } : {}),
      ...(fbId !== null ? { fbPostId: fbId } : {}),
    };
  }

  if (igId === null) {
    const error = "Instagram não devolveu id de mídia";
    await patch(input.store, input.post.id, {
      status: "failed",
      error,
      expectedPublicationState: input.post.publicationState,
    });
    return { kind: "publish_failed", ok: false, reason: "publish_failed", error };
  }

  if (input.store.savePublicationState === undefined) {
    const updated = await patch(input.store, input.post.id, {
      status: "published",
      publishedAt: now().toISOString(),
      error: null,
      expectedPublicationState: input.post.publicationState,
    });
    if (updated.kind !== "saved") {
      return {
        kind: "persistence_failed",
        ok: false,
        reason: "persistence_failed",
        error: updated.kind === "conflict" ? updated.error : "falha ao persistir status",
        ...(igId !== null ? { igMediaId: igId } : {}),
        ...(fbId !== null ? { fbPostId: fbId } : {}),
      };
    }
  }
  return {
    kind: "published",
    ok: true,
    mediaId: igId,
    imageUrl: input.post.imageUrl,
    ...(fbId !== null ? { fbPostId: fbId } : {}),
  };
}
