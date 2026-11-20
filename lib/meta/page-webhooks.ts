export const PAGE_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_echoes",
  "feed",
] as const;

export type PageWebhookResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number | null };

const PAGE_ID_RE = /^[0-9]+$/;
const GRAPH_BASE = "https://graph.facebook.com";
const MAX_TEXT = 140;

type FetchImpl = typeof fetch;

function graphUrl(apiVersion: string, path: string): string {
  return `${GRAPH_BASE}/${apiVersion}/${path}`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object"
  ) {
    const err = (payload as { error: { message?: unknown } }).error;
    if (typeof err.message === "string" && err.message.length > 0) {
      return err.message;
    }
  }
  return `HTTP ${String(status)}`;
}

export async function getSubscribedFields({
  pageId,
  appId,
  accessToken,
  apiVersion,
  fetchImpl,
}: {
  pageId: string;
  appId: string;
  accessToken: string;
  apiVersion: string;
  fetchImpl?: FetchImpl;
}): Promise<PageWebhookResult<string[]>> {
  if (!PAGE_ID_RE.test(pageId)) {
    return { ok: false, error: "id inválido", status: null };
  }
  const doFetch = fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(graphUrl(apiVersion, `${pageId}/subscribed_apps`), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "falha de rede ao chamar a Graph API", status: null };
  }
  const payload = await readJson(res);
  if (!res.ok) {
    return { ok: false, error: errorMessage(payload, res.status), status: res.status };
  }
  const data =
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    Array.isArray((payload).data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  const entry = data.find(
    (item): item is { id: string; subscribed_fields?: unknown } =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      (item).id === appId,
  );
  if (entry === undefined) {
    return { ok: true, data: [] };
  }
  const raw = Array.isArray(entry.subscribed_fields) ? entry.subscribed_fields : [];
  const fields = raw.filter((f): f is string => typeof f === "string");
  return { ok: true, data: fields };
}

export async function subscribePageFields({
  pageId,
  fields,
  accessToken,
  apiVersion,
  fetchImpl,
}: {
  pageId: string;
  fields: readonly string[];
  accessToken: string;
  apiVersion: string;
  fetchImpl?: FetchImpl;
}): Promise<PageWebhookResult<true>> {
  if (!PAGE_ID_RE.test(pageId)) {
    return { ok: false, error: "id inválido", status: null };
  }
  const allowed = new Set<string>(PAGE_WEBHOOK_FIELDS);
  const selected = fields.filter((f): f is string => allowed.has(f));
  if (selected.length === 0) {
    return { ok: false, error: "nenhum campo", status: null };
  }
  const doFetch = fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(graphUrl(apiVersion, `${pageId}/subscribed_apps`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ subscribed_fields: selected.join(",") }).toString(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "falha de rede ao chamar a Graph API", status: null };
  }
  const payload = await readJson(res);
  if (!res.ok) {
    return { ok: false, error: errorMessage(payload, res.status), status: res.status };
  }
  return { ok: true, data: true };
}

export function summarizeWebhookPayload(payload: unknown): {
  kind: "mensagem" | "comentario" | "eco" | "outro";
  channel: string | null;
  text: string;
} {
  const obj =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
  const getString = (key: string): string | null =>
    typeof obj[key] === "string" ? (obj[key]) : null;

  let text = getString("text") ?? "";
  if (text.length > MAX_TEXT) {
    text = `${text.slice(0, MAX_TEXT)}…`;
  }

  if (has("commentId")) {
    return { kind: "comentario", channel: "instagram", text };
  }
  if (has("appId") && has("recipientId") && !has("senderId")) {
    const source = getString("source");
    return { kind: "eco", channel: source, text };
  }
  if (has("senderId") && has("eventId")) {
    const source = getString("source");
    return { kind: "mensagem", channel: source, text };
  }
  return { kind: "outro", channel: getString("source"), text };
}
