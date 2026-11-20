export type PageContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number | null };

export interface PageProfile {
  id: string;
  name: string;
  link: string | null;
  fanCount: number | null;
  pictureUrl: string | null;
}

export interface PagePost {
  id: string;
  message: string | null;
  createdTime: string | null;
  permalinkUrl: string | null;
  fullPicture: string | null;
}

const PAGE_ID_RE = /^[0-9]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = asString(payload.error.message);
    if (message !== null) return message;
  }
  return `HTTP ${String(status)}`;
}

function extractPictureUrl(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const picture = payload.picture;
  if (!isRecord(picture) || !isRecord(picture.data)) return null;
  return asString(picture.data.url);
}

async function requestJson(
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; status: number; payload: unknown }
  | { ok: false; error: string; status: number | null }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "falha de rede ao chamar a Graph API",
      status: null,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: extractErrorMessage(payload, response.status),
      status: response.status,
    };
  }

  if (payload === null) {
    return { ok: false, error: "resposta inválida da Graph API", status: response.status };
  }

  return { ok: true, status: response.status, payload };
}

export async function fetchPageProfile(options: {
  pageId: string;
  accessToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}): Promise<PageContentResult<PageProfile>> {
  const { pageId, accessToken, apiVersion, fetchImpl = fetch } = options;

  if (!PAGE_ID_RE.test(pageId)) {
    return { ok: false, error: "id inválido", status: null };
  }

  const fields = "id,name,link,fan_count,picture.type(large){url}";
  const url = `https://graph.facebook.com/${apiVersion}/${pageId}?fields=${fields}`;

  const result = await requestJson(url, accessToken, fetchImpl);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  const payload = result.payload;
  if (!isRecord(payload)) {
    return { ok: false, error: "resposta inválida da Graph API", status: result.status };
  }

  const id = asString(payload.id);
  const name = asString(payload.name);
  if (id === null || name === null) {
    return { ok: false, error: "resposta inválida da Graph API", status: result.status };
  }

  const data: PageProfile = {
    id,
    name,
    link: asString(payload.link),
    fanCount: asNumber(payload.fan_count),
    pictureUrl: extractPictureUrl(payload),
  };

  return { ok: true, data };
}

export async function listPagePosts(options: {
  pageId: string;
  accessToken: string;
  apiVersion: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}): Promise<PageContentResult<PagePost[]>> {
  const { pageId, accessToken, apiVersion, fetchImpl = fetch } = options;
  const requested = options.limit ?? 10;
  const limit = Math.min(25, Math.max(1, Math.trunc(requested)));

  if (!PAGE_ID_RE.test(pageId)) {
    return { ok: false, error: "id inválido", status: null };
  }

  const fields = "id,message,created_time,permalink_url,full_picture";
  const url = `https://graph.facebook.com/${apiVersion}/${pageId}/posts?fields=${fields}&limit=${String(limit)}`;

  const result = await requestJson(url, accessToken, fetchImpl);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  const payload = result.payload;
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return { ok: false, error: "resposta inválida da Graph API", status: result.status };
  }

  const posts: PagePost[] = [];
  for (const entry of payload.data as unknown[]) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    if (id === null) continue;
    posts.push({
      id,
      message: asString(entry.message),
      createdTime: asString(entry.created_time),
      permalinkUrl: asString(entry.permalink_url),
      fullPicture: asString(entry.full_picture),
    });
  }

  return { ok: true, data: posts };
}
