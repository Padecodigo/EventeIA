"use server";

import { revalidatePath } from "next/cache";

import type { OpResult } from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { artForEventType } from "@/lib/prospecting/photos";
import { createSupabasePostStore, findImageFor } from "@/lib/prospecting/posts-store";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Publica um post de isca aprovado por um humano (o clique é a aprovação).
 * Sem token do Instagram ou chave do ModelsLab, devolve erro sem chamar a API.
 */
export async function publishPostAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const env = serverEnv();
  if (
    env.META_ACCESS_TOKEN === undefined ||
    env.META_INSTAGRAM_BUSINESS_ID === undefined
  ) {
    return { ok: false, error: "Configure META_ACCESS_TOKEN e META_INSTAGRAM_BUSINESS_ID." };
  }

  const caption = form.get("caption");
  const imagePrompt = form.get("imagePrompt");
  const category = form.get("category");
  const handlesRaw = form.get("handles");
  if (typeof caption !== "string" || typeof imagePrompt !== "string" || typeof category !== "string") {
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
  // Cache: reusa a imagem do mesmo evento + necessidade (novo contexto => nova imagem).
  const cachedArt = eventId !== undefined ? await findImageFor(eventId, category) : null;
  // Arte com a identidade da EventeIA, por tipo de evento (sem valores no post).
  let eventType: string | null = null;
  if (eventId !== undefined) {
    const { data } = await getSupabaseAdmin().from("events").select("event_type").eq("id", eventId).maybeSingle();
    eventType = data?.event_type ?? null;
  }
  const brandedArt =
    eventId !== undefined
      ? { url: `${env.NEXT_PUBLIC_APP_URL}${artForEventType(eventType)}`, expiresAt: new Date(Date.now() + 365 * 86_400_000) }
      : null;
  const outcome = await publishPlannedPost({
    planned: { dayIndex: Number.isFinite(dayIndex) ? dayIndex : 0, category, handles, imagePrompt, caption },
    approved: true,
    modelslabKey: env.MODELSLAB_API_KEY,
    meta: {
      igUserId: env.META_INSTAGRAM_BUSINESS_ID,
      accessToken: env.META_ACCESS_TOKEN,
      apiVersion: env.META_API_VERSION,
      apiHost: env.META_API_HOST,
    },
    store: createSupabasePostStore(),
    eventId,
    cachedArt,
    fallbackArt: brandedArt !== null ? { url: brandedArt.url } : undefined,
    persistArt: undefined,
  });

  if (!outcome.ok) {
    logger.warn({ reason: outcome.reason, error: outcome.error }, "falha ao publicar post de isca");
    return { ok: false, error: `Falha ao publicar (${outcome.reason}).` };
  }

  revalidatePath("/admin/prospeccao");
  return { ok: true };
}
