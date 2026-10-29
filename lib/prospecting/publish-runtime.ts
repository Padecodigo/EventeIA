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
  /** Chave do gerador de imagem (ModelsLab/NVIDIA). Sem chave, usa o fallback. */
  modelslabKey?: string;
  meta: MetaPublishConfig;
  store?: PostStore;
  /** Evento de origem do plano (gravado em prospect_posts). */
  eventId?: string;
  /** Arte em cache (mesmo evento + necessidade) com validade. */
  cachedArt?: { url: string; expiresAt: Date } | null;
  /** Arte da marca usada quando não há chave de geração ou a geração falha. */
  fallbackArt?: { url: string };
  /** Persiste a arte gerada (Storage) e devolve URL + validade. */
  persistArt?: (sourceUrl: string) => Promise<{ url: string; expiresAt: Date }>;
  fetchImpl?: typeof fetch;
}

export async function publishPlannedPost(input: PublishPlannedPostInput): Promise<PublishOutcome> {
  let imageUrl = input.cachedArt?.url ?? null;
  let imageExpiresAt: Date | null = input.cachedArt?.expiresAt ?? null;

  if (!input.approved) {
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      imageExpiresAt: imageExpiresAt ?? undefined,
      status: "pending_approval",
    });
    return { ok: false, reason: "approval_required" };
  }

  if (imageUrl === null) {
    const hasGenerationKey = (input.modelslabKey ?? "").length > 0;
    if (hasGenerationKey) {
      const image = await generateImage({
        apiKey: input.modelslabKey as string,
        prompt: input.planned.imagePrompt,
        fetchImpl: input.fetchImpl,
      });
      if (image.ok) {
        if (image.images.length > 0) {
          imageUrl = image.images[0];
          if (input.persistArt !== undefined) {
            const stored = await input.persistArt(imageUrl);
            imageUrl = stored.url;
            imageExpiresAt = stored.expiresAt;
          } else if (image.expiresAt !== undefined) {
            // Provedor já persistiu (ex.: NVIDIA → Storage) e informou a validade.
            imageExpiresAt = image.expiresAt;
          }
        } else if (input.fallbackArt !== undefined) {
          imageUrl = input.fallbackArt.url;
          imageExpiresAt = null;
        } else {
          const reason = "resposta sem URL de imagem";
          await input.store?.record({
            planned: input.planned,
            eventId: input.eventId,
            imageExpiresAt: imageExpiresAt ?? undefined,
            status: "failed",
            error: reason,
          });
          return { ok: false, reason: "image_failed", error: reason };
        }
      } else if (input.fallbackArt !== undefined) {
        imageUrl = input.fallbackArt.url;
        imageExpiresAt = null;
      } else {
        await input.store?.record({
          planned: input.planned,
          eventId: input.eventId,
          imageExpiresAt: imageExpiresAt ?? undefined,
          status: "failed",
          error: image.error,
        });
        return { ok: false, reason: "image_failed", error: image.error };
      }
    } else if (input.fallbackArt !== undefined) {
      imageUrl = input.fallbackArt.url;
      imageExpiresAt = null;
    } else {
      return { ok: false, reason: "image_failed", error: "sem chave de geração e sem arte de fallback" };
    }
  }

  const container = await createMediaContainer({
    ...input.meta,
    imageUrl,
    caption: input.planned.caption,
    userTags: input.planned.handles,
    fetchImpl: input.fetchImpl,
  });
  if (!container.ok) {
    await input.store?.record({ planned: input.planned, eventId: input.eventId,
    imageExpiresAt: imageExpiresAt ?? undefined, status: "failed", imageUrl, error: container.error });
    return { ok: false, reason: "container_failed", error: container.error };
  }

  const published = await publishContainer({
    ...input.meta,
    creationId: container.id,
    fetchImpl: input.fetchImpl,
  });
  if (!published.ok) {
    await input.store?.record({ planned: input.planned, eventId: input.eventId,
    imageExpiresAt: imageExpiresAt ?? undefined, status: "failed", imageUrl, error: published.error });
    return { ok: false, reason: "publish_failed", error: published.error };
  }

  await input.store?.record({
    planned: input.planned,
    eventId: input.eventId,
    imageExpiresAt: imageExpiresAt ?? undefined,
    status: "published",
    imageUrl,
    igMediaId: published.id,
  });
  return { ok: true, mediaId: published.id, imageUrl };
}
