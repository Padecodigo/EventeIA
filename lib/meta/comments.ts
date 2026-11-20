/**
 * Leitura e moderação de comentários do Instagram (Instagram API com Facebook
 * Login / permissão instagram_manage_comments).
 *
 * Módulo puro: não usa server-only e recebe o token por parâmetro. O token vai
 * SOMENTE no cabeçalho Authorization: Bearer <token> — nunca em URLs, logs ou
 * mensagens de erro.
 */

const API_BASE = "https://graph.facebook.com";
const ID_PATTERN = /^[0-9]+$/;
const MAX_MESSAGE_LENGTH = 2200;

export type CommentsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number | null };

export interface IgMedia {
  id: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string | null;
  mediaType: string | null;
  previewUrl: string | null;
  commentsCount: number;
}

export interface IgComment {
  id: string;
  text: string;
  username: string | null;
  timestamp: string | null;
  hidden: boolean;
  replies: IgComment[];
}

interface RequestOptions {
  accessToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

function buildUrl(apiVersion: string, path: string, query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return `${API_BASE}/${apiVersion}/${path}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseMedia(raw: unknown): IgMedia | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (id === null) return null;

  const mediaType = asString(raw.media_type);
  const mediaUrl = asString(raw.media_url);
  const thumbnailUrl = asString(raw.thumbnail_url);

  let previewUrl: string | null;
  if (mediaType === "VIDEO") {
    previewUrl = thumbnailUrl ?? mediaUrl;
  } else if (mediaType === "IMAGE" || mediaType === "CAROUSEL_ALBUM") {
    previewUrl = mediaUrl ?? thumbnailUrl;
  } else {
    previewUrl = mediaUrl ?? thumbnailUrl;
  }

  return {
    id,
    caption: asString(raw.caption),
    permalink: asString(raw.permalink),
    timestamp: asString(raw.timestamp),
    mediaType,
    previewUrl,
    commentsCount: asNumber(raw.comments_count),
  };
}

function parseComment(raw: unknown): IgComment | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (id === null) return null;

  const replies: IgComment[] = [];
  const repliesRaw = raw.replies;
  if (isRecord(repliesRaw) && Array.isArray(repliesRaw.data)) {
    for (const item of repliesRaw.data) {
      const reply = parseComment(item);
      if (reply !== null) replies.push(reply);
    }
  }

  return {
    id,
    text: asString(raw.text) ?? "",
    username: asString(raw.username),
    timestamp: asString(raw.timestamp),
    hidden: asBoolean(raw.hidden),
    replies,
  };
}

interface ApiFailure {
  error?: { message?: unknown };
}

function readErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const failure = payload as ApiFailure;
  const nested = failure.error;
  if (!isRecord(nested)) return null;
  const message = nested.message;
  return typeof message === "string" ? message : null;
}

async function request(
  options: RequestOptions,
  url: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<CommentsResult<unknown>> {
  const fetcher = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetcher(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return { ok: false, error: "falha de rede ao chamar a Graph API", status: null };
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    return {
      ok: false,
      error: readErrorMessage(payload) ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
  }

  if (payload === undefined) {
    return { ok: false, error: "resposta inválida da Graph API", status: response.status };
  }

  return { ok: true, data: payload };
}

function invalidId(): CommentsResult<never> {
  return { ok: false, error: "id inválido", status: null };
}

function normalizeMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

interface MessageValidation {
  message: string;
}

function validateMessage(raw: string): CommentsResult<MessageValidation> {
  const trimmed = normalizeMessage(raw);
  if (trimmed === null) {
    return { ok: false, error: "mensagem vazia", status: null };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "mensagem longa demais", status: null };
  }
  return { ok: true, data: { message: trimmed } };
}

/** GET /{ig-user-id}/media */
export async function listRecentMedia(
  input: RequestOptions & { igUserId: string },
): Promise<CommentsResult<IgMedia[]>> {
  if (!ID_PATTERN.test(input.igUserId)) return invalidId();

  const url = buildUrl(input.apiVersion, `${input.igUserId}/media`, {
    fields: "id,caption,permalink,timestamp,media_type,media_url,thumbnail_url,comments_count",
    limit: "25",
  });

  const result = await request(input, url, { method: "GET" });
  if (!result.ok) return result;

  const payload = result.data;
  const list: IgMedia[] = [];
  if (isRecord(payload) && Array.isArray(payload.data)) {
    for (const item of payload.data) {
      const media = parseMedia(item);
      if (media !== null) list.push(media);
    }
  }
  return { ok: true, data: list };
}

/** GET /{ig-media-id}/comments */
export async function listMediaComments(
  input: RequestOptions & { mediaId: string },
): Promise<CommentsResult<IgComment[]>> {
  if (!ID_PATTERN.test(input.mediaId)) return invalidId();

  const url = buildUrl(input.apiVersion, `${input.mediaId}/comments`, {
    fields: "id,text,username,timestamp,hidden,like_count,replies{id,text,username,timestamp,hidden}",
    limit: "50",
  });

  const result = await request(input, url, { method: "GET" });
  if (!result.ok) return result;

  const payload = result.data;
  const list: IgComment[] = [];
  if (isRecord(payload) && Array.isArray(payload.data)) {
    for (const item of payload.data) {
      const comment = parseComment(item);
      if (comment !== null) list.push(comment);
    }
  }
  return { ok: true, data: list };
}

/** POST /{ig-media-id}/comments */
export async function createComment(
  input: RequestOptions & { mediaId: string; message: string },
): Promise<CommentsResult<{ id: string }>> {
  if (!ID_PATTERN.test(input.mediaId)) return invalidId();

  const validated = validateMessage(input.message);
  if (!validated.ok) return validated;

  const url = buildUrl(input.apiVersion, `${input.mediaId}/comments`, {});
  const result = await request(input, url, {
    method: "POST",
    body: { message: validated.data.message },
  });
  if (!result.ok) return result;

  const id = isRecord(result.data) ? asString(result.data.id) : null;
  if (id === null) {
    return { ok: false, error: "resposta inválida da Graph API", status: 200 };
  }
  return { ok: true, data: { id } };
}

/** POST /{ig-comment-id}/replies */
export async function replyToComment(
  input: RequestOptions & { commentId: string; message: string },
): Promise<CommentsResult<{ id: string }>> {
  if (!ID_PATTERN.test(input.commentId)) return invalidId();

  const validated = validateMessage(input.message);
  if (!validated.ok) return validated;

  const url = buildUrl(input.apiVersion, `${input.commentId}/replies`, {});
  const result = await request(input, url, {
    method: "POST",
    body: { message: validated.data.message },
  });
  if (!result.ok) return result;

  const id = isRecord(result.data) ? asString(result.data.id) : null;
  if (id === null) {
    return { ok: false, error: "resposta inválida da Graph API", status: 200 };
  }
  return { ok: true, data: { id } };
}

/** POST /{ig-comment-id} com { hide } */
export async function setCommentHidden(
  input: RequestOptions & { commentId: string; hidden: boolean },
): Promise<CommentsResult<true>> {
  if (!ID_PATTERN.test(input.commentId)) return invalidId();

  const url = buildUrl(input.apiVersion, input.commentId, {});
  const result = await request(input, url, {
    method: "POST",
    body: { hide: input.hidden },
  });
  if (!result.ok) return result;

  const success = isRecord(result.data) ? asBoolean(result.data.success) : false;
  if (!success) {
    return { ok: false, error: "resposta inválida da Graph API", status: 200 };
  }
  return { ok: true, data: true };
}

/** DELETE /{ig-comment-id} */
export async function deleteComment(
  input: RequestOptions & { commentId: string },
): Promise<CommentsResult<true>> {
  if (!ID_PATTERN.test(input.commentId)) return invalidId();

  const url = buildUrl(input.apiVersion, input.commentId, {});
  const result = await request(input, url, { method: "DELETE" });
  if (!result.ok) return result;

  const success = isRecord(result.data) ? asBoolean(result.data.success) : false;
  if (!success) {
    return { ok: false, error: "resposta inválida da Graph API", status: 200 };
  }
  return { ok: true, data: true };
}
