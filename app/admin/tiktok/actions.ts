"use server";

import { requireAdmin } from "@/lib/auth";
import { uploadTiktokDraft, type TiktokDraftResult } from "@/lib/tiktok/draft";

export type TiktokDraftState = TiktokDraftResult | null;

/** Admin envia um vídeo para o inbox (rascunho) do TikTok; nunca publica. */
export async function uploadTiktokDraftAction(
  _prev: TiktokDraftState,
  formData: FormData,
): Promise<TiktokDraftState> {
  await requireAdmin();
  const video = formData.get("video");
  return uploadTiktokDraft(video instanceof File ? video : null);
}
