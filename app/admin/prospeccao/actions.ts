"use server";

import { revalidatePath } from "next/cache";

import type { OpResult } from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabasePostStore, findImageFor } from "@/lib/prospecting/posts-store";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";

/**
 * Publica um post de isca aprovado por um humano (o clique é a aprovação).
 * Sem token do Instagram ou chave do ModelsLab, devolve erro sem chamar a API.
 */
export async function publishPostAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const env = serverEnv();
  if (
    env.META_ACCESS_TOKEN === undefined ||
    env.META_INSTAGRAM_BUSINESS_ID === undefined ||
    env.MODELSLAB_API_KEY === undefined
  ) {
    return { ok: false, error: "Configure META_ACCESS_TOKEN, META_INSTAGRAM_BUSINESS_ID e MODELSLAB_API_KEY." };
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
  const cachedImageUrl = eventId !== undefined ? await findImageFor(eventId, category) : null;
  const outcome = await publishPlannedPost({
    planned: { dayIndex: Number.isFinite(dayIndex) ? dayIndex : 0, category, handles, imagePrompt, caption },
    approved: true,
    modelslabKey: env.MODELSLAB_API_KEY,
    meta: {
      igUserId: env.META_INSTAGRAM_BUSINESS_ID,
      accessToken: env.META_ACCESS_TOKEN,
      apiVersion: env.META_API_VERSION,
    },
    store: createSupabasePostStore(),
    eventId,
    cachedImageUrl,
  });

  if (!outcome.ok) {
    logger.warn({ reason: outcome.reason, error: outcome.error }, "falha ao publicar post de isca");
    return { ok: false, error: `Falha ao publicar (${outcome.reason}).` };
  }

  revalidatePath("/admin/prospeccao");
  return { ok: true };
}
