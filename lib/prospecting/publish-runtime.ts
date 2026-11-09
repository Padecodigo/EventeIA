import { randomInt } from "node:crypto";

import { withFreshScene } from "@/lib/marketing/brazilian-cast";
import { composeAd } from "@/lib/marketing/card-overlay";
import {
  publishToChannels,
  type ChannelPublicationIds,
  type MetaPublishConfig,
} from "@/lib/meta/publishing";
import { generateImage } from "@/lib/modelslab/client";
import { storeArtBytes } from "@/lib/prospecting/art-cache";

import type { BaitReservation, PostStore, PostStatus } from "./posts-store";
import { canPublishForEvent, type EventPublicationState } from "./publish-guard";
import type { PlannedPost } from "./publish-plan";
import type { PublicationState } from "./publication-state";

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
    if (input.eventId === undefined) {
      return {
        kind: "persistence_failed",
        ok: false,
        reason: "persistence_failed",
        error: "publicação de isca exige eventId para reserva durável",
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
  for (let attempt = 0; attempt < FRESH_ATTEMPTS && imageUrl === null; attempt += 1) {
    const image = await generateImage({
      apiKey: input.modelslabKey as string,
      prompt: withFreshScene(input.planned.imagePrompt, input.planned.dayIndex + attempt),
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
      eventId: input.eventId as string,
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

  const statusFor = (state: PublicationState): PostStatus => {
    if (state.instagram.kind === "published" && state.facebook.kind === "published") {
      return "published";
    }
    if (state.instagram.kind === "uncertain" || state.facebook.kind === "uncertain") {
      return "failed";
    }
    if (state.instagram.kind === "failed" || state.facebook.kind === "failed") {
      return "failed";
    }
    return "approved";
  };

  const reservationId = reservation?.id ?? null;
  let latestState: PublicationState | null = reservation?.state ?? null;
  const dual = await publishToChannels({
    ...input.meta,
    imageUrl,
    caption: input.planned.caption,
    userTags: input.planned.handles,
    existing: reservation === null ? input.existing : undefined,
    initialState: reservation?.state,
    onState:
      reservationId === null || input.store?.saveState === undefined
        ? undefined
        : async (state, previous) => {
            latestState = state;
            const saved = await input.store!.saveState!(
              reservationId,
              state,
              statusFor(state),
              previous,
            );
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

  const igId = dual.instagram.kind === "published" ? dual.instagram.id : null;
  const fbId = dual.facebook.kind === "published" ? dual.facebook.id : null;

  if (dual.kind === "uncertain") {
    return {
      kind: "uncertain",
      ok: false,
      reason: "uncertain",
      error: dual.error,
      ...(igId !== null ? { igMediaId: igId } : {}),
      ...(fbId !== null ? { fbPostId: fbId } : {}),
    };
  }

  if (dual.kind !== "published" || igId === null) {
    const reason: PublishFailure =
      dual.kind === "failed" && dual.instagram.kind === "failed"
        ? dual.instagram.stage === "container"
          ? "container_failed"
          : "publish_failed"
        : "facebook_failed";
    const error = dual.kind === "published" ? "Instagram não devolveu id" : dual.error;

    if (reservation !== null && input.store?.saveState !== undefined && latestState !== null) {
      await input.store.saveState(reservation.id, latestState, "failed");
    } else {
      await input.store?.record({
        planned: input.planned,
        eventId: input.eventId,
        imageExpiresAt: imageExpiresAt ?? undefined,
        status: "failed",
        imageUrl,
        error,
        ...(igId !== null ? { igMediaId: igId } : {}),
        ...(fbId !== null ? { fbPostId: fbId } : {}),
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

  if (reservation === null) {
    await input.store?.record({
      planned: input.planned,
      eventId: input.eventId,
      imageExpiresAt: imageExpiresAt ?? undefined,
      status: "published",
      imageUrl,
      igMediaId: igId,
      ...(fbId !== null ? { fbPostId: fbId } : {}),
    });
  }
  return {
    kind: "published",
    ok: true,
    mediaId: igId,
    imageUrl,
    ...(fbId !== null ? { fbPostId: fbId } : {}),
  };
}
