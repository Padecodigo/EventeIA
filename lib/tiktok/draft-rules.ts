/**
 * Regras puras do envio de rascunho do TikTok (client + server).
 * O TikTok Upload (inbox) aceita MP4/MOV/WebM; o limite local evita payloads
 * grandes no Server Action (o limite da action é ajustado em next.config.mjs).
 */

export const TIKTOK_DRAFT_MAX_BYTES = 50 * 1024 * 1024;
export const TIKTOK_DRAFT_MAX_MB = TIKTOK_DRAFT_MAX_BYTES / (1024 * 1024);
export const TIKTOK_DRAFT_ACCEPT = "video/mp4,video/quicktime,video/webm";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export interface TiktokDraftFileLike {
  size: number;
  type: string;
}

export type TiktokDraftFileValidation =
  { ok: true; contentType: string } | { ok: false; error: string };

/** Valida tamanho e MIME do vídeo antes de ler os bytes ou chamar o TikTok. */
export function validateTiktokDraftFile(
  file: TiktokDraftFileLike | null | undefined,
): TiktokDraftFileValidation {
  if (file === null || file === undefined || !Number.isSafeInteger(file.size) || file.size <= 0) {
    return { ok: false, error: "Selecione um vídeo." };
  }
  if (file.size > TIKTOK_DRAFT_MAX_BYTES) {
    return { ok: false, error: `Vídeo acima de ${String(TIKTOK_DRAFT_MAX_MB)} MB.` };
  }
  const contentType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    return { ok: false, error: "Envie um vídeo MP4, MOV ou WebM." };
  }
  return { ok: true, contentType };
}
