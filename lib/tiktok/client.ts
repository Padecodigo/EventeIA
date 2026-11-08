/**
 * Cliente da TikTok Content Posting API (v2) + OAuth token exchange.
 * Só servidor (importa "server-only"). Todas as funções recebem um access token
 * e permitem injeção de `fetch` para testes offline.
 */

import "server-only";

export const TIKTOK_API_BASE = "https://open.tiktokapis.com";

export type TiktokResult<T> =
  { ok: true; data: T } | { ok: false; error: string; status: number | null };

export interface TiktokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface TokenExchangeInput {
  code: string;
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}

/**
 * Troca o `code` por access/refresh token (servidor → servidor; o client_secret
 * NUNCA sai deste processo).
 */
export async function exchangeCodeForToken(
  input: TokenExchangeInput,
): Promise<TiktokResult<TiktokTokenResponse>> {
  const fetcher = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_key: input.clientKey,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetcher(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  const payload = (await response.json().catch(() => null)) as
    (TiktokTokenResponse & { error?: string; error_description?: string }) | null;

  if (!response.ok) {
    const error = payload?.error_description ?? payload?.error ?? `HTTP ${String(response.status)}`;
    return { ok: false, error, status: response.status };
  }

  if (payload === null || typeof payload.access_token !== "string") {
    return { ok: false, error: "token sem access_token", status: response.status };
  }

  return { ok: true, data: payload };
}

export interface CreatorInfo {
  open_id: string;
  display_name: string;
  avatar_url: string;
}

export interface CreatorInfoInput {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

/** Dados públicos do criador (open_id, display_name, avatar_url). */
export async function creatorInfo(input: CreatorInfoInput): Promise<TiktokResult<CreatorInfo>> {
  const fetcher = input.fetchImpl ?? fetch;
  const url = `${TIKTOK_API_BASE}/v2/user/info/?fields=${encodeURIComponent(
    "open_id,display_name,avatar_url",
  )}`;

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { user?: CreatorInfo };
    error?: { message?: string; code?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
  }

  const user = payload?.data?.user;
  if (user === undefined) {
    return { ok: false, error: "resposta sem user", status: response.status };
  }
  return { ok: true, data: user };
}

export interface UploadInitData {
  publish_id: string;
  upload_url: string;
}

/** Resposta de /init precisa dos dois campos antes de qualquer upload/uso. */
function parseUploadInitData(value: unknown): UploadInitData | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  const publishId = data.publish_id;
  const uploadUrl = data.upload_url;
  if (
    typeof publishId !== "string" ||
    publishId.length === 0 ||
    publishId.length > 64 ||
    typeof uploadUrl !== "string" ||
    uploadUrl.length === 0 ||
    uploadUrl.length > 256
  ) {
    return null;
  }
  return { publish_id: publishId, upload_url: uploadUrl };
}

export interface VideoUploadInitInput {
  accessToken: string;
  videoSizeBytes: number;
  chunkSizeBytes: number;
  totalChunkCount: number;
  /** Legado/compatibilidade: o inbox não usa post_info; o título é definido no app. */
  title?: string;
  privacyLevel?: string;
  fetchImpl?: typeof fetch;
}

/** Inicializa upload de VÍDEO como rascunho (inbox) — sem publish direto. */
export async function uploadVideoInit(
  input: VideoUploadInitInput,
): Promise<TiktokResult<UploadInitData>> {
  const result = await postJson<unknown>(
    "/v2/post/publish/inbox/video/init/",
    input.accessToken,
    {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: input.videoSizeBytes,
        chunk_size: input.chunkSizeBytes,
        total_chunk_count: input.totalChunkCount,
      },
    },
    input.fetchImpl,
  );
  if (!result.ok) return result;

  const data = parseUploadInitData(result.data);
  if (data === null) {
    return { ok: false, error: "resposta de upload inválida", status: null };
  }
  return { ok: true, data };
}

export interface VideoUploadInput {
  uploadUrl: string;
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  fetchImpl?: typeof fetch;
}

const TIKTOK_UPLOAD_HOST_SUFFIX = ".tiktokapis.com";

/** O upload_url devolvido pelo TikTok é a única URL externa que recebe o arquivo. */
export function isTrustedTiktokUploadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port !== "") return false;
    if (url.username.length > 0 || url.password.length > 0) return false;
    if (!url.pathname.startsWith("/video/")) return false;
    const host = url.hostname.toLowerCase();
    return host === "tiktokapis.com" || host.endsWith(TIKTOK_UPLOAD_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * PUT do arquivo inteiro para o upload_url do TikTok (até 64 MB é permitido em
 * um único chunk). Valida o host para não transformar a resposta da API em SSRF.
 */
export async function uploadVideoToTiktok(
  input: VideoUploadInput,
): Promise<TiktokResult<{ status: number }>> {
  if (!isTrustedTiktokUploadUrl(input.uploadUrl)) {
    return { ok: false, error: "upload_url inválida", status: null };
  }
  const size = input.bytes.byteLength;
  if (size === 0) {
    return { ok: false, error: "arquivo vazio", status: null };
  }

  const fetcher = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(input.uploadUrl, {
      method: "PUT",
      // Nunca seguir 3xx: 307/308 reenviariam o vídeo para o Location.
      redirect: "error",
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(size),
        "Content-Range": `bytes 0-${String(size - 1)}/${String(size)}`,
      },
      body: new Blob([input.bytes], { type: input.contentType }),
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  if (response.status !== 201) {
    return { ok: false, error: `HTTP ${String(response.status)}`, status: response.status };
  }
  return { ok: true, data: { status: response.status } };
}

export interface PhotoFileInput {
  photoFileSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

export interface PhotoUploadInitInput {
  accessToken: string;
  title: string;
  photoFiles: PhotoFileInput[];
  photoCoverIndex?: number;
  privacyLevel?: string;
  fetchImpl?: typeof fetch;
}

/** Inicializa upload de FOTOS (carrossel) como rascunho (inbox). */
export async function uploadPhotoInit(
  input: PhotoUploadInitInput,
): Promise<TiktokResult<UploadInitData>> {
  return postJson(
    "/v2/post/publish/content/init/",
    input.accessToken,
    {
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel ?? "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        photo_cover_index: input.photoCoverIndex ?? 0,
        photo_files: input.photoFiles.map((file) => ({
          photo_file_size: file.photoFileSize,
          chunk_size: file.chunkSize,
          total_chunk_count: file.totalChunkCount,
        })),
      },
    },
    input.fetchImpl,
  );
}

export interface PublishStatus {
  status: string;
  fail_reason?: string;
}

export interface PublishStatusInput {
  accessToken: string;
  publishId: string;
  fetchImpl?: typeof fetch;
}

/** Consulta o status de uma publicação iniciada (draft/upload). */
export async function fetchPublishStatus(
  input: PublishStatusInput,
): Promise<TiktokResult<PublishStatus>> {
  return postJson(
    "/v2/post/publish/status/fetch/",
    input.accessToken,
    {
      publish_id: input.publishId,
    },
    input.fetchImpl,
  );
}

/** POST JSON autenticado (Bearer) com corpo `data` envelopado na resposta. */
async function postJson<T>(
  path: string,
  accessToken: string,
  body: unknown,
  fetchImpl: typeof fetch | undefined,
): Promise<TiktokResult<T>> {
  const fetcher = fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${TIKTOK_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string; code?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
  }

  // A API pode devolver HTTP 200 com error.code != "ok"; isso não é sucesso.
  if (payload?.error?.code !== undefined && payload.error.code !== "ok") {
    return {
      ok: false,
      error: payload.error.message ?? payload.error.code,
      status: response.status,
    };
  }

  if (payload?.data === undefined || payload.data === null) {
    return { ok: false, error: "resposta sem data", status: response.status };
  }
  return { ok: true, data: payload.data };
}
