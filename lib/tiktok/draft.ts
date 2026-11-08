/**
 * Envio de rascunho (inbox) do TikTok: valida o arquivo, lê o token ativo
 * criptografado, inicializa o upload oficial e envia o arquivo inteiro.
 * Nunca publica: o usuário conclui/revisa o rascunho dentro do TikTok.
 */

import "server-only";

import { logger } from "@/lib/logger";

import {
  isTrustedTiktokUploadUrl,
  uploadVideoInit,
  uploadVideoToTiktok,
  type TiktokResult,
  type UploadInitData,
} from "./client";
import { validateTiktokDraftFile, type TiktokDraftFileValidation } from "./draft-rules";
import {
  getActiveTiktokAccessToken,
  type TiktokAccessTokenReason,
  type TiktokAccessTokenResult,
} from "./store";

export type TiktokDraftResult = { ok: true; publishId: string } | { ok: false; error: string };

export interface TiktokDraftDeps {
  getAccessToken(): Promise<TiktokAccessTokenResult>;
  initUpload(input: {
    accessToken: string;
    videoSizeBytes: number;
    chunkSizeBytes: number;
    totalChunkCount: number;
  }): Promise<TiktokResult<UploadInitData>>;
  uploadVideo(input: {
    uploadUrl: string;
    bytes: Uint8Array<ArrayBuffer>;
    contentType: string;
  }): Promise<TiktokResult<{ status: number }>>;
}

const TOKEN_ERRORS: Record<TiktokAccessTokenReason, string> = {
  missing_account: "Nenhuma conta TikTok conectada no ambiente ativo.",
  not_encrypted: "A conta do TikTok foi salva sem criptografia. Reconecte a conta.",
  missing_key: "A criptografia dos tokens do TikTok não está configurada. Reconecte a conta.",
  decrypt_failed: "Não foi possível ler o token salvo. Reconecte a conta.",
  expired: "O token do TikTok expirou. Reconecte a conta.",
};

const runtimeDeps: TiktokDraftDeps = {
  getAccessToken: getActiveTiktokAccessToken,
  initUpload: (input) =>
    uploadVideoInit({
      accessToken: input.accessToken,
      videoSizeBytes: input.videoSizeBytes,
      chunkSizeBytes: input.chunkSizeBytes,
      totalChunkCount: input.totalChunkCount,
    }),
  uploadVideo: (input) => uploadVideoToTiktok(input),
};

/** Fluxo completo de upload de rascunho; `deps` permite testes offline. */
export async function uploadTiktokDraft(
  file: File | null,
  deps: TiktokDraftDeps = runtimeDeps,
): Promise<TiktokDraftResult> {
  const validation: TiktokDraftFileValidation = validateTiktokDraftFile(file);
  if (!validation.ok) return validation;
  if (file === null) return { ok: false, error: "Selecione um vídeo." };

  const token = await deps.getAccessToken();
  if (!token.ok) return { ok: false, error: TOKEN_ERRORS[token.reason] };

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Não foi possível ler o arquivo." };
  }
  if (bytes.byteLength === 0 || bytes.byteLength !== file.size) {
    return { ok: false, error: "Não foi possível ler o arquivo." };
  }

  const init = await deps.initUpload({
    accessToken: token.accessToken,
    videoSizeBytes: bytes.byteLength,
    chunkSizeBytes: bytes.byteLength,
    totalChunkCount: 1,
  });
  if (!init.ok) {
    logger.warn({ status: init.status }, "TikTok recusou inicialização do rascunho");
    return { ok: false, error: "Não foi possível iniciar o rascunho no TikTok. Tente novamente." };
  }
  if (!isTrustedTiktokUploadUrl(init.data.upload_url)) {
    logger.warn("TikTok devolveu upload_url fora do domínio oficial");
    return { ok: false, error: "O TikTok devolveu um endereço de upload inválido." };
  }

  const upload = await deps.uploadVideo({
    uploadUrl: init.data.upload_url,
    bytes,
    contentType: validation.contentType,
  });
  if (!upload.ok) {
    logger.warn({ status: upload.status }, "falha ao enviar rascunho para o TikTok");
    return { ok: false, error: "Não foi possível enviar o vídeo ao TikTok. Tente novamente." };
  }

  return { ok: true, publishId: init.data.publish_id };
}
