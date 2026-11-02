import { CAPTION, GRAPH_API_VERSION, USER_TAGS_MAX } from "./limits";

/**
 * Content Publishing + private reply do Instagram (Graph API v26.0).
 *
 * Endpoints da documentação consultada em 2026-10-27:
 * - cria container: `POST /<IG_ID>/media` (image_url, caption, user_tags);
 * - publica: `POST /<IG_ID>/media_publish` (creation_id);
 * - private reply a comentário: `POST /<IG_ID>/messages` (recipient.comment_id).
 */

export interface MetaPublishConfig {
  igUserId: string;
  accessToken: string;
  /** `graph.facebook.com` (Facebook Login) ou `graph.instagram.com` (IG Login). */
  apiHost?: string;
  apiVersion?: string;
}

export type PublishResult = { ok: true; id: string } | { ok: false; error: string; status: number | null };

export type CaptionCheck = { ok: true } | { ok: false; reason: string };

/** Valida a legenda contra os limites documentados (chars, hashtags, @menções). */
export function validateCaption(caption: string): CaptionCheck {
  if (caption.length > CAPTION.maxChars) {
    return { ok: false, reason: `legenda acima de ${String(CAPTION.maxChars)} caracteres` };
  }
  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (hashtags > CAPTION.maxHashtags) {
    return { ok: false, reason: `mais de ${String(CAPTION.maxHashtags)} hashtags` };
  }
  const mentions = (caption.match(/@[A-Za-z0-9._]+/g) ?? []).length;
  if (mentions > CAPTION.maxMentions) {
    return { ok: false, reason: `mais de ${String(CAPTION.maxMentions)} @menções` };
  }
  return { ok: true };
}

/** Corta as marcações no teto adotado (nunca acima do que a plataforma aceita). */
export function limitUserTags(tags: readonly string[]): string[] {
  return tags.slice(0, USER_TAGS_MAX);
}

function baseUrl(config: MetaPublishConfig): string {
  const host = config.apiHost ?? "graph.facebook.com";
  const version = config.apiVersion ?? GRAPH_API_VERSION;
  return `https://${host}/${version}/${config.igUserId}`;
}

async function postJson(
  url: string,
  accessToken: string,
  body: unknown,
  fetchImpl: typeof fetch | undefined,
): Promise<PublishResult> {
  const fetcher = fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }
  const payload = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    return { ok: false, error: payload?.error?.message ?? `HTTP ${String(response.status)}`, status: response.status };
  }
  if (payload?.id === undefined) {
    return { ok: false, error: "resposta sem id", status: response.status };
  }
  return { ok: true, id: payload.id };
}

/** Cria o container de mídia (imagem hospedada publicamente). */
export async function createMediaContainer(
  input: MetaPublishConfig & {
    imageUrl: string;
    caption: string;
    userTags?: readonly string[];
    fetchImpl?: typeof fetch;
  },
): Promise<PublishResult> {
  const check = validateCaption(input.caption);
  if (!check.ok) return { ok: false, error: check.reason, status: null };

  const params = new URLSearchParams({ image_url: input.imageUrl, caption: input.caption });
  const tags = limitUserTags(input.userTags ?? []);
  if (tags.length > 0) params.set("user_tags", JSON.stringify(tags));

  return postJson(`${baseUrl(input)}/media?${params.toString()}`, input.accessToken, {}, input.fetchImpl);
}

type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNKNOWN";

interface ContainerWaitOptions {
  /** Tentativas de leitura do status antes de desistir (padrão 10). */
  maxAttempts?: number;
  /** Intervalo entre leituras em ms (padrão 3000). */
  intervalMs?: number;
  /** Injetável nos testes. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lê `GET /{container-id}?fields=status_code`. A Meta processa a imagem de forma
 * assíncrona; publicar antes de `FINISHED` devolve "Media ID is not available".
 */
async function getContainerStatus(
  input: MetaPublishConfig & { containerId: string; fetchImpl?: typeof fetch },
): Promise<{ ok: true; status: ContainerStatus } | { ok: false; error: string; status: number | null }> {
  const host = input.apiHost ?? "graph.facebook.com";
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const url = `https://${host}/${version}/${input.containerId}?fields=status_code`;
  const fetcher = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${input.accessToken}` } });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }
  const payload = (await response.json().catch(() => null)) as
    | { status_code?: string; error?: { message?: string } }
    | null;
  if (!response.ok) {
    return { ok: false, error: payload?.error?.message ?? `HTTP ${String(response.status)}`, status: response.status };
  }
  const known: ContainerStatus[] = ["FINISHED", "IN_PROGRESS", "ERROR", "EXPIRED", "PUBLISHED"];
  const code = payload?.status_code;
  return { ok: true, status: known.find((k) => k === code) ?? "UNKNOWN" };
}

/** Espera o container ficar `FINISHED` (ou falha em ERROR/EXPIRED/timeout). */
async function waitForContainerReady(
  input: MetaPublishConfig & { containerId: string; fetchImpl?: typeof fetch } & ContainerWaitOptions,
): Promise<{ ok: true } | { ok: false; error: string; status: number | null }> {
  const maxAttempts = input.maxAttempts ?? 10;
  const intervalMs = input.intervalMs ?? 3000;
  const sleep = input.sleep ?? defaultSleep;
  let last = "sem leitura";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const read = await getContainerStatus(input);
    if (read.ok) {
      if (read.status === "FINISHED") return { ok: true };
      if (read.status === "ERROR" || read.status === "EXPIRED" || read.status === "PUBLISHED") {
        return { ok: false, error: `container ${read.status}`, status: null };
      }
      last = read.status;
    } else {
      last = read.error;
    }
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return { ok: false, error: `container não ficou pronto (${last})`, status: null };
}

/**
 * Publica o container criado. Por padrão espera o `status_code` FINISHED antes
 * do `media_publish` (sem isso a Meta responde "Media ID is not available").
 */
export async function publishContainer(
  input: MetaPublishConfig & {
    creationId: string;
    fetchImpl?: typeof fetch;
    /** `false` pula a espera (só para quem já confirmou FINISHED). */
    waitForReady?: boolean;
  } & ContainerWaitOptions,
): Promise<PublishResult> {
  if (input.waitForReady !== false) {
    const ready = await waitForContainerReady({ ...input, containerId: input.creationId });
    if (!ready.ok) return ready;
  }
  const params = new URLSearchParams({ creation_id: input.creationId });
  return postJson(`${baseUrl(input)}/media_publish?${params.toString()}`, input.accessToken, {}, input.fetchImpl);
}

/**
 * Exclui uma mídia publicada — `DELETE /{ig-media-id}`.
 * Usado para apagar o post de isca quando a prospecção do evento termina.
 */
export async function deleteMedia(
  input: MetaPublishConfig & { mediaId: string; fetchImpl?: typeof fetch },
): Promise<PublishResult> {
  const host = input.apiHost ?? "graph.facebook.com";
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const url = `https://${host}/${version}/${input.mediaId}`;
  const fetcher = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: payload?.error?.message ?? `HTTP ${String(response.status)}`, status: response.status };
  }
  return { ok: true, id: input.mediaId };
}

/** Private reply a um comentário (1 mensagem, até 7 dias após o comentário). */
export async function sendPrivateReply(
  input: MetaPublishConfig & { commentId: string; text: string; fetchImpl?: typeof fetch },
): Promise<PublishResult> {
  return postJson(
    `${baseUrl(input)}/messages`,
    input.accessToken,
    { recipient: { comment_id: input.commentId }, message: { text: input.text } },
    input.fetchImpl,
  );
}
