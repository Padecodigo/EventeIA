"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";

import type { OpResult } from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { cleanupEventPublicationsById } from "@/lib/events/social-cleanup";
import { logger } from "@/lib/logger";
import { composeAd } from "@/lib/marketing/card-overlay";
import { metaPublishConfigFromEnv } from "@/lib/meta/config";
import { generateImage } from "@/lib/modelslab/client";
import { storeArtBytes } from "@/lib/prospecting/art-cache";
import {
  buildEventPostContent,
  buildEventPostImagePrompt,
  eventTypeLabel,
} from "@/lib/prospecting/event-post";
import {
  createSupabaseProspectingPostStore,
  PublicationConflictError,
  type ProspectingPostRecord,
} from "@/lib/prospecting/event-post-store";
import { activeImageApiKey } from "@/lib/prospecting/image-key";
import { loadLookingFor } from "@/lib/prospecting/looking-for";
import { createSupabasePostStore } from "@/lib/prospecting/posts-store";
import { publishEventPost } from "@/lib/prospecting/publish-event-post";
import { choosePublishPath } from "@/lib/prospecting/publish-path";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Publica um post de isca aprovado por um humano (o clique é a aprovação).
 * Sem token do Instagram ou chave do ModelsLab, devolve erro sem chamar a API.
 */
export async function publishPostAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const env = serverEnv();
  const path = choosePublishPath(env);
  if (path === "unconfigured") {
    return { ok: false, error: "Configure META_ACCESS_TOKEN e META_INSTAGRAM_BUSINESS_ID." };
  }

  const caption = form.get("caption");
  const imagePrompt = form.get("imagePrompt");
  const category = form.get("category");
  const handlesRaw = form.get("handles");
  if (
    typeof caption !== "string" ||
    typeof imagePrompt !== "string" ||
    typeof category !== "string"
  ) {
    return { ok: false, error: "Post inválido." };
  }

  let handles: string[] = [];
  if (typeof handlesRaw === "string" && handlesRaw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(handlesRaw);
      if (Array.isArray(parsed)) handles = parsed.filter((h): h is string => typeof h === "string");
    } catch {
      return { ok: false, error: "Lista de menções inválida." };
    }
  }

  const eventIdRaw = form.get("eventId");
  const eventId = typeof eventIdRaw === "string" && eventIdRaw.length > 0 ? eventIdRaw : undefined;
  const dayIndex = Number(form.get("dayIndex"));
  let eventState: {
    status: string | null;
    closed_at: string | null;
    user_deleted_at: string | null;
  } | null = null;
  if (eventId !== undefined) {
    const { data } = await getSupabaseAdmin()
      .from("events")
      .select("event_type,status,closed_at,user_deleted_at")
      .eq("id", eventId)
      .maybeSingle();
    eventState =
      data === null
        ? null
        : {
            status: data.status,
            closed_at: data.closed_at ?? null,
            user_deleted_at: data.user_deleted_at ?? null,
          };
  }
  // O navegador só publica Instagram e não devolve media id. Como o fluxo
  // exige Facebook + Instagram via Graph, recusamos em vez de enfileirar.
  if (path === "browser") {
    return {
      ok: false,
      error:
        "Publicação de evento/isca exige Graph API (Facebook + Instagram). O provedor de navegador não publica o Facebook.",
    };
  }

  const meta = metaPublishConfigFromEnv(env);
  if (meta.igUserId.length === 0 || meta.accessToken.length === 0) {
    return { ok: false, error: "Configure META_ACCESS_TOKEN e META_INSTAGRAM_BUSINESS_ID." };
  }
  if ((meta.pageId ?? "").length === 0) {
    return {
      ok: false,
      error: "Configure META_PAGE_ID e META_PAGE_ACCESS_TOKEN para publicar no Facebook.",
    };
  }

  const outcome = await publishPlannedPost({
    planned: {
      dayIndex: Number.isFinite(dayIndex) ? dayIndex : 0,
      category,
      handles,
      imagePrompt,
      caption,
    },
    approved: true,
    modelslabKey: activeImageApiKey(),
    meta,
    store: createSupabasePostStore(),
    eventId,
    event: eventId === undefined ? undefined : eventState,
    requireFacebook: true,
    ...(eventId === undefined
      ? {}
      : {
          recheckEvent: async () => {
            const { data } = await getSupabaseAdmin()
              .from("events")
              .select("status,closed_at,user_deleted_at")
              .eq("id", eventId)
              .maybeSingle();
            return data === null
              ? null
              : {
                  status: data.status,
                  closed_at: data.closed_at ?? null,
                  user_deleted_at: data.user_deleted_at ?? null,
                };
          },
          onEventClosed: async () => {
            await cleanupEventPublicationsById([eventId]);
          },
        }),
    persistArt: undefined,
  });

  if (!outcome.ok) {
    logger.warn({ reason: outcome.reason, error: outcome.error }, "falha ao publicar post de isca");
    return { ok: false, error: `Falha ao publicar (${outcome.reason}).` };
  }

  revalidatePath("/admin/prospeccao");
  return { ok: true };
}

/**
 * Aprova e publica o post de prospecção do evento.
 *
 * A aprovação é o clique do admin. O conteúdo (legenda e parâmetros de imagem)
 * é reconstruído no servidor apenas com dados públicos do evento — nunca com
 * PII do cliente. A publicação usa o client existente do Instagram.
 */
export async function approveEventPostAction(
  _prev: OpResult | null,
  form: FormData,
): Promise<OpResult> {
  await requireAdmin();

  const eventIdRaw = form.get("eventId");
  if (typeof eventIdRaw !== "string" || eventIdRaw.trim().length === 0) {
    return { ok: false, error: "Evento inválido." };
  }
  const eventId = eventIdRaw.trim();

  const admin = getSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select(
      "id,event_type,event_date,city,city_uf,region_code,confirmed_at,status,closed_at,user_deleted_at",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (event === null) {
    return { ok: false, error: "Evento não encontrado." };
  }
  if (event.confirmed_at === null) {
    return { ok: false, error: "Evento ainda não confirmado pelo contratante (código por DM)." };
  }

  const env = serverEnv();
  const source = {
    eventId: event.id,
    eventType: event.event_type,
    eventDate: event.event_date,
    city: event.city,
    region: event.city_uf ?? event.region_code,
    lookingFor: await loadLookingFor(admin, event.id),
  };
  const content = buildEventPostContent(source);
  const path = choosePublishPath(env);
  const store = createSupabaseProspectingPostStore();

  let post: ProspectingPostRecord;
  try {
    post = await store.upsert({ ...source, imageUrl: null, status: "pending_approval" });
  } catch (caught) {
    if (caught instanceof PublicationConflictError) {
      return {
        ok: false,
        error: "Publicação em andamento para este evento. Aguarde e tente novamente.",
      };
    }
    return { ok: false, error: "Não foi possível gerar o post de prospecção." };
  }

  const imageKey = activeImageApiKey();
  if (imageKey === undefined) {
    return {
      ok: false,
      error:
        "Geração indisponível. Configure IMAGE_PROVIDER e MODELSLAB_API_KEY ou NVIDIA_NIM_API_KEY. Nada foi publicado.",
    };
  }
  let imageUrl: string | null = null;
  const castBase = Math.floor(Date.now() / 60_000);
  for (let attempt = 0; attempt < 3 && imageUrl === null; attempt += 1) {
    const image = await generateImage({
      apiKey: imageKey,
      prompt: buildEventPostImagePrompt(source, castBase + attempt),
      seed: randomInt(1, 2_147_483_647),
      width: 1080,
      height: 1350,
    });
    if (!image.ok || image.images.length === 0) continue;
    try {
      const response = await fetch(image.images[0]);
      if (!response.ok) continue;
      const composed = await composeAd(Buffer.from(await response.arrayBuffer()), {
        headline: [eventTypeLabel(event.event_type)],
        categories: [],
        width: 1080,
        height: 1350,
      });
      imageUrl = (await storeArtBytes(composed, "image/jpeg")).url;
    } catch (error) {
      logger.warn({ error: String(error) }, "falha ao compor a imagem do post de evento");
    }
  }
  if (imageUrl === null) {
    await store.updateStatus(post.id, {
      status: "failed",
      error: "Flux não gerou imagem nova",
    });
    return { ok: false, error: "O Flux não gerou uma imagem nova. Nada foi publicado." };
  }
  await store.updateStatus(post.id, { imageUrl, status: "pending_approval" });

  // O provedor de navegador não publica Facebook nem expõe media id; o fluxo
  // de evento exige Graph API para os dois canais.
  if (path === "browser") {
    return {
      ok: false,
      error:
        "Publicação do evento exige Graph API (Facebook + Instagram). O provedor de navegador não publica o Facebook.",
    };
  }

  const meta = metaPublishConfigFromEnv(env);
  if (meta.igUserId.length === 0 || meta.accessToken.length === 0) {
    return { ok: false, error: "Configure META_ACCESS_TOKEN e META_INSTAGRAM_BUSINESS_ID." };
  }
  if ((meta.pageId ?? "").length === 0) {
    return {
      ok: false,
      error: "Configure META_PAGE_ID e META_PAGE_ACCESS_TOKEN para publicar no Facebook.",
    };
  }

  const outcome = await publishEventPost({
    post: {
      id: post.id,
      caption: content.caption,
      imageUrl,
      igMediaId: post.igMediaId,
      fbPostId: post.fbPostId,
      publicationState: post.publicationState,
    },
    approved: true,
    meta,
    store,
    event: {
      status: event.status,
      closed_at: event.closed_at ?? null,
      user_deleted_at: event.user_deleted_at ?? null,
    },
    requireFacebook: true,
    recheckEvent: async () => {
      const { data } = await admin
        .from("events")
        .select("status,closed_at,user_deleted_at")
        .eq("id", event.id)
        .maybeSingle();
      return data === null
        ? null
        : {
            status: data.status,
            closed_at: data.closed_at ?? null,
            user_deleted_at: data.user_deleted_at ?? null,
          };
    },
    onEventClosed: async () => {
      await cleanupEventPublicationsById([event.id]);
    },
  });

  if (!outcome.ok) {
    logger.warn(
      { reason: outcome.reason, error: outcome.error },
      "falha ao publicar post de prospecção",
    );
    return { ok: false, error: `Falha ao publicar (${outcome.reason}).` };
  }

  revalidatePath("/admin/prospeccao");
  return { ok: true };
}
