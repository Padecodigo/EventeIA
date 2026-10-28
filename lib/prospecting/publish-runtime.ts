import { createMediaContainer, publishContainer, type MetaPublishConfig } from "@/lib/meta/publishing";
import { generateImage } from "@/lib/modelslab/client";

import type { PostStore } from "./posts-store";
import type { PlannedPost } from "./publish-plan";

/**
 * Publica um post planejado: gera a imagem (SDXL), cria o container e publica.
 * Gate de aprovação humana: sem `approved`, nada é chamado.
 */

export type PublishFailure =
  | "approval_required"
  | "image_failed"
  | "container_failed"
  | "publish_failed";

export type PublishOutcome =
  | { ok: true; mediaId: string; imageUrl: string }
  | { ok: false; reason: PublishFailure; error?: string };

export interface PublishPlannedPostInput {
  planned: PlannedPost;
  approved: boolean;
  modelslabKey: string;
  meta: MetaPublishConfig;
  store?: PostStore;
  /** Evento de origem do plano (gravado em prospect_posts). */
  eventId?: string;
  /** Imagem já gerada para o mesmo evento + necessidade (evita nova geração). */
  cachedImageUrl?: string | null;
  fetchImpl?: typeof fetch;
}

export async function publishPlannedPost(input: PublishPlannedPostInput): Promise<PublishOutcome> {
  if (!input.approved) {
    await input.store?.record({ planned: input.planned, eventId: input.eventId, status: "pending_approval" });
    return { ok: false, reason: "approval_required" };
  }

  let imageUrl = input.cachedImageUrl ?? null;
  if (imageUrl === null) {
    const image = await generateImage({
      apiKey: input.modelslabKey,
      prompt: input.planned.imagePrompt,
      fetchImpl: input.fetchImpl,
    });
    if (!image.ok) {
      await input.store?.record({ planned: input.planned, eventId: input.eventId, status: "failed", error: image.error });
      return { ok: false, reason: "image_failed", error: image.error };
    }
    imageUrl = image.images[0] ?? null;
    if (imageUrl === null) return { ok: false, reason: "image_failed", error: "resposta sem URL de imagem" };
  }

  const container = await createMediaContainer({
    ...input.meta,
    imageUrl,
    caption: input.planned.caption,
    userTags: input.planned.handles,
    fetchImpl: input.fetchImpl,
  });
  if (!container.ok) {
    await input.store?.record({ planned: input.planned, eventId: input.eventId, status: "failed", imageUrl, error: container.error });
    return { ok: false, reason: "container_failed", error: container.error };
  }

  const published = await publishContainer({
    ...input.meta,
    creationId: container.id,
    fetchImpl: input.fetchImpl,
  });
  if (!published.ok) {
    await input.store?.record({ planned: input.planned, eventId: input.eventId, status: "failed", imageUrl, error: published.error });
    return { ok: false, reason: "publish_failed", error: published.error };
  }

  await input.store?.record({
    planned: input.planned,
    eventId: input.eventId,
    status: "published",
    imageUrl,
    igMediaId: published.id,
  });
  return { ok: true, mediaId: published.id, imageUrl };
}
