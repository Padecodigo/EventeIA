import { createMediaContainer, publishContainer, type MetaPublishConfig } from "@/lib/meta/publishing";

import type { ProspectingPostStatusPatch, ProspectingPostStore } from "./event-post-store";

/**
 * Publicação do post de prospecção aprovado por um humano.
 *
 * Reusa o client de publicação do Instagram (`lib/meta/publishing`): cria o
 * container da imagem da marca e publica. Nenhuma tag especial (HUMAN_AGENT) é
 * usada e não há marcação de fornecedores — o post é aberto, sem abordagem fria.
 */

export type EventPostPublishFailure =
  | "approval_required"
  | "missing_image"
  | "container_failed"
  | "publish_failed";

export type EventPostPublishOutcome =
  | { ok: true; mediaId: string; imageUrl: string }
  | { ok: false; reason: EventPostPublishFailure; error?: string };

export interface PublishEventPostInput {
  post: {
    id: string;
    caption: string;
    imageUrl: string | null;
  };
  approved: boolean;
  meta: MetaPublishConfig;
  store: Pick<ProspectingPostStore, "updateStatus">;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

async function patch(
  store: Pick<ProspectingPostStore, "updateStatus">,
  id: string,
  values: ProspectingPostStatusPatch,
): Promise<void> {
  await store.updateStatus(id, values);
}

export async function publishEventPost(input: PublishEventPostInput): Promise<EventPostPublishOutcome> {
  const now = input.now ?? (() => new Date());

  if (!input.approved) {
    await patch(input.store, input.post.id, { status: "pending_approval" });
    return { ok: false, reason: "approval_required" };
  }

  if (input.post.imageUrl === null || input.post.imageUrl.trim().length === 0) {
    const error = "post sem imagem da marca";
    await patch(input.store, input.post.id, { status: "failed", error });
    return { ok: false, reason: "missing_image", error };
  }

  const container = await createMediaContainer({
    ...input.meta,
    imageUrl: input.post.imageUrl,
    caption: input.post.caption,
    fetchImpl: input.fetchImpl,
  });
  if (!container.ok) {
    await patch(input.store, input.post.id, { status: "failed", error: container.error });
    return { ok: false, reason: "container_failed", error: container.error };
  }

  const published = await publishContainer({
    ...input.meta,
    creationId: container.id,
    fetchImpl: input.fetchImpl,
  });
  if (!published.ok) {
    await patch(input.store, input.post.id, { status: "failed", error: published.error });
    return { ok: false, reason: "publish_failed", error: published.error };
  }

  await patch(input.store, input.post.id, {
    status: "published",
    igMediaId: published.id,
    publishedAt: now().toISOString(),
    error: null,
  });
  return { ok: true, mediaId: published.id, imageUrl: input.post.imageUrl };
}
