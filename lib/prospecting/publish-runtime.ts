import { randomInt } from "node:crypto";

import { composeAd } from "@/lib/marketing/card-overlay";
import {
  publishFacebookPagePost,
  publishInstagramImage,
  type ChannelPublicationIds,
  type MetaPublishConfig,
} from "@/lib/meta/publishing";
import { generateImage } from "@/lib/modelslab/client";
import { storeArtBytes } from "@/lib/prospecting/art-cache";

import type { BaitReservation, PostStore } from "./posts-store";
import type { PublicationState } from "./publication-state";
import { canPublishForEvent, type EventPublicationState } from "./publish-guard";
import type { PlannedPost } from "./publish-plan";
import { recentPublicationCount } from "./recent-publications";
import { IMAGE_NEGATIVE, withFreshScene } from "./scene-rules";

/**
 * Publica um post planejado: gera a imagem (SDXL), cria o container e publica.
 * Gate de aprovação humana: sem `approved`, nada é chamado.
 */

export type PublishFailure =
  | "approval_required"
  | "image_failed"
  | "container_failed"
  | "publish_failed"
  | "facebook_failed"
  | "event_closed"
  | "migration_required"
  | "persistence_failed"
  | "uncertain";

export type PublishOutcome =
  | { kind: "published"; ok: true; mediaId: string; imageUrl: string; fbPostId?: string }
  | {
      kind: "failed" | PublishFailure;
      ok: false;
      reason: PublishFailure;
      error?: string;
      igMediaId?: string;
      fbPostId?: string;
    };

export interface PublishPlannedPostInput {
  planned: PlannedPost;
  approved: boolean;
  /** Chave do gerador de imagem (ModelsLab/NVIDIA). Sem chave, a publicação falha. */
  modelslabKey?: string;
  meta: MetaPublishConfig;
  store?: PostStore;
  /** Evento de origem do plano (gravado em prospect_posts). */
  eventId?: string;
  /** Estado do evento (bloqueia publicação após encerramento/exclusão). */
  event?: EventPublicationState | null;
  /** Ids remotos já publicados (apenas compatibilidade; produção usa a reserva). */
  existing?: ChannelPublicationIds;
  /** Exige a Página do Facebook configurada (fluxo de evento). */
  requireFacebook?: boolean;
  /** Recheca o evento depois do efeito remoto (H1). */
  recheckEvent?: () => Promise<EventPublicationState | null>;
  /** Dispara limpeza quando o evento fechou durante a publicação. */
  onEventClosed?: () => Promise<void>;
  /**
   * Ignorado. Cada publicação gera uma cena nova no Flux.
   * O campo permanece para chamadas antigas não republicarem a foto em cache.
   */
  cachedArt?: { url: string; expiresAt: Date } | null;
  /** Ignorado. Foto estática não substitui uma geração que falhou. */
  fallbackArt?: { url: string };
  /** Persiste a arte gerada (Storage) e devolve URL + validade. */
  persistArt?: (sourceUrl: string) => Promise<{ url: string; expiresAt: Date }>;
  fetchImpl?: typeof fetch;
}

/** Baixa uma URL de imagem para bytes (I/O injetável nos testes). */
async function downloadBytes(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download da imagem falhou (${String(response.status)})`);
  return Buffer.from(await response.arrayBuffer());
}

const FRESH_ATTEMPTS = 3;

/**
 * Persiste a cena do Flux com o quadro editorial por cima.
 * `persistArt` injetado só nos testes. Falha devolve `null` (nova tentativa).
 */
async function persistGeneratedArt(
  sourceUrl: string,
  input: PublishPlannedPostInput,
): Promise<{ url: string; expiresAt: Date } | null> {
  if (input.persistArt !== undefined) {
    try {
      return await input.persistArt(sourceUrl);
    } catch {
      return null;
    }
  }
  try {
    const bytes = await downloadBytes(sourceUrl, input.fetchImpl ?? fetch);
    const composed = await composeAd(bytes, {
      headline: [input.planned.category],
      categories: [],
      width: 1080,
      height: 1350,
    });
    return await storeArtBytes(composed, "image/jpeg");
  } catch {
    return null;
  }
}

export async function publishPlannedPost(input: PublishPlannedPostInput): Promise<PublishOutcome> {
  let imageUrl: string | null = null;
  let imageExpiresAt: Date | null = null;

  if (!input.approved) {
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      imageExpiresAt: imageExpiresAt ?? undefined,
      status: "pending_approval",
    });
    return { kind: "approval_required", ok: false, reason: "approval_required" };
  }

  // B2: sem schema de persistência por canal, NENHUMA chamada remota acontece.
  if (input.requireFacebook === true) {
    if (
      input.store?.probe === undefined ||
      input.store.reserve === undefined ||
      input.store.saveState === undefined
    ) {
      return {
        kind: "migration_required",
        ok: false,
        reason: "migration_required",
        error: "persistência por canal (fb_post_id/publication) não disponível",
      };
    }
    const probe = await input.store.probe();
    if (probe.kind === "migration_required") {
      return {
        kind: "migration_required",
        ok: false,
        reason: "migration_required",
        error: `migração necessária: ${probe.missing.join(", ")}`,
      };
    }
    if (probe.kind === "failed") {
      return {
        kind: "persistence_failed",
        ok: false,
        reason: "persistence_failed",
        error: probe.error,
      };
    }
  }

  if (input.event !== undefined && !canPublishForEvent(input.event)) {
    const error = "evento encerrado ou excluído";
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      imageExpiresAt: imageExpiresAt ?? undefined,
      status: "failed",
      error,
    });
    return { kind: "event_closed", ok: false, reason: "event_closed", error };
  }

  const hasGenerationKey = (input.modelslabKey ?? "").length > 0;
  if (!hasGenerationKey) {
    return {
      kind: "image_failed",
      ok: false,
      reason: "image_failed",
      error: "sem chave de geração (IMAGE_PROVIDER, MODELSLAB_API_KEY ou NVIDIA_NIM_API_KEY)",
    };
  }

  let lastError = "geração da imagem falhou";
  const sceneBias = (await recentPublicationCount()) + randomInt(0, 48);
  for (let attempt = 0; attempt < FRESH_ATTEMPTS && imageUrl === null; attempt += 1) {
    const image = await generateImage({
      apiKey: input.modelslabKey as string,
      prompt: withFreshScene(
        input.planned.imagePrompt,
        sceneBias + input.planned.dayIndex + attempt,
        input.planned.eventType,
      ),
      negativePrompt: IMAGE_NEGATIVE,
      seed: randomInt(1, 2_147_483_647),
      width: 1080,
      height: 1350,
      fetchImpl: input.fetchImpl,
    });
    if (!image.ok || image.images.length === 0) {
      lastError = image.ok ? "resposta sem URL de imagem" : image.error;
      continue;
    }
    const stored = await persistGeneratedArt(image.images[0], input);
    if (stored === null) {
      lastError = "persistência da arte falhou";
      continue;
    }
    imageUrl = stored.url;
    imageExpiresAt = stored.expiresAt;
  }

  if (imageUrl === null) {
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      status: "failed",
      error: lastError,
    });
    return { kind: "image_failed", ok: false, reason: "image_failed", error: lastError };
  }

  let reservation: BaitReservation | null = null;
  if (input.requireFacebook === true) {
    const reserved = await input.store?.reserve?.({
      planned: input.planned,
      eventId: input.eventId ?? null,
      imageUrl,
      imageExpiresAt: imageExpiresAt ?? undefined,
    });
    if (reserved === undefined) {
      return {
        kind: "migration_required",
        ok: false,
        reason: "migration_required",
        error: "reserva durável indisponível",
      };
    }
    if (reserved.kind === "migration_required") {
      return {
        kind: "migration_required",
        ok: false,
        reason: "migration_required",
        error: `migração necessária: ${reserved.missing.join(", ")}`,
      };
    }
    if (reserved.kind === "failed") {
      return {
        kind: "persistence_failed",
        ok: false,
        reason: "persistence_failed",
        error: reserved.error,
      };
    }
    reservation = reserved.reservation;
  }

  // Publica SEPARADAMENTE: Instagram e Facebook são independentes. Uma falha em
  // um canal não contamina o outro (sem o `publishToChannels` acoplado, que virava
  // "uncertain" quando o Instagram falhava por formato de tag).
  // Reusa o estado já persistido (retry/reconciliação) para NÃO republicar o
  // canal que já foi publicado — só tenta o que ainda falta.
  const reservedIg =
    reservation?.state.instagram.kind === "published" ? reservation.state.instagram.id : null;
  const reservedFb =
    reservation?.state.facebook.kind === "published" ? reservation.state.facebook.id : null;
  const existingIg = input.existing?.igMediaId ?? reservedIg;
  const existingFb = input.existing?.fbPostId ?? reservedFb;

  const igResult =
    existingIg !== null
      ? ({ ok: true as const, id: existingIg } as const)
      : await publishInstagramImage({
          ...input.meta,
          imageUrl,
          caption: input.planned.caption,
          userTags: input.planned.handles,
          fetchImpl: input.fetchImpl,
        });

  const fbResult =
    input.requireFacebook === true
      ? existingFb !== null
        ? ({ ok: true as const, id: existingFb } as const)
        : await publishFacebookPagePost({
            ...input.meta,
            imageUrl,
            caption: input.planned.caption,
            fetchImpl: input.fetchImpl,
          })
      : null;

  const igId = igResult.ok ? igResult.id : null;
  const fbId = fbResult !== null && fbResult.ok ? fbResult.id : null;
  const fbRequired = input.requireFacebook === true;
  const published = igResult.ok && (!fbRequired || (fbResult !== null && fbResult.ok));

  const finalState: PublicationState = {
    version: 1,
    instagram: igResult.ok
      ? { kind: "published", id: igResult.id }
      : { kind: "failed", error: igResult.error },
    facebook:
      fbResult === null
        ? { kind: "pending" }
        : fbResult.ok
          ? { kind: "published", id: fbResult.id }
          : { kind: "failed", error: fbResult.error },
  };

  if (reservation !== null && input.store?.saveState !== undefined) {
    await input.store.saveState(reservation.id, finalState, published ? "published" : "failed");
  } else {
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      imageExpiresAt: imageExpiresAt ?? undefined,
      status: published ? "published" : "failed",
      imageUrl,
      ...(igId !== null ? { igMediaId: igId } : {}),
      ...(fbId !== null ? { fbPostId: fbId } : {}),
      ...(published
        ? {}
        : {
            error: igResult.ok
              ? fbResult !== null && !fbResult.ok
                ? fbResult.error
                : "Facebook não publicou"
              : igResult.error,
          }),
    });
  }

  if (input.recheckEvent !== undefined) {
    const after = await input.recheckEvent();
    if (after === null || !canPublishForEvent(after)) {
      if (input.onEventClosed !== undefined) await input.onEventClosed();
    }
  }

  if (published) {
    return {
      kind: "published",
      ok: true,
      mediaId: igId as string,
      imageUrl,
      ...(fbId !== null ? { fbPostId: fbId } : {}),
    };
  }

  const reason: PublishFailure = igResult.ok ? "facebook_failed" : "publish_failed";
  const error = igResult.ok
    ? fbResult !== null && !fbResult.ok
      ? fbResult.error
      : "Facebook não publicou"
    : igResult.error;
  return {
    kind: "failed",
    ok: false,
    reason,
    error,
    ...(igId !== null ? { igMediaId: igId } : {}),
    ...(fbId !== null ? { fbPostId: fbId } : {}),
  };
}
