import { z } from "zod";

import {
  publicationStateFromLegacy,
  setChannelState,
  type PublicationState,
} from "@/lib/prospecting/publication-state";

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
  /** Página do Facebook alvo da publicação cruzada (opcional = legado só IG). */
  pageId?: string;
  /** Page token com `pages_manage_posts`; cai para `accessToken` quando ausente. */
  pageAccessToken?: string;
  /** Alias aceito por integrações antigas. */
  facebookPageId?: string;
  /** Alias aceito por integrações antigas. */
  facebookPageAccessToken?: string;
}

export type PublishResult =
  { ok: true; id: string } | { ok: false; error: string; status: number | null };

export type RemoteChannel = "instagram" | "facebook";

/**
 * Resultado estruturado de DELETE. Só `deleted` autoriza limpar a referência
 * remota; qualquer outro kind mantém o id para reconciliação/retry.
 */
export type RemoteDeleteOutcome =
  | { kind: "deleted"; channel: RemoteChannel; id: string }
  | { kind: "missing_credentials"; channel: RemoteChannel; error: string }
  | { kind: "permission_or_token"; channel: RemoteChannel; error: string }
  | { kind: "missing_permission"; channel: RemoteChannel; error: string }
  | { kind: "unsupported"; channel: RemoteChannel; error: string }
  | { kind: "transient"; channel: RemoteChannel; error: string }
  | { kind: "unknown"; channel: RemoteChannel; error: string }
  | { kind: "not_confirmed_absent"; channel: RemoteChannel; error: string };

const graphErrorSchema = z
  .object({
    message: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    subcode: z.number().optional(),
  })
  .passthrough();

const graphDeleteResponseSchema = z
  .object({
    success: z.boolean().optional(),
    error: graphErrorSchema.optional(),
  })
  .passthrough();

type GraphDeleteResponse = z.infer<typeof graphDeleteResponseSchema>;

interface GraphErrorPayload {
  message?: string;
  code?: number;
  error_subcode?: number;
  subcode?: number;
}

/** Alvo de publicação/remoção na Página do Facebook. */
export function facebookTarget(
  config: MetaPublishConfig,
): { pageId: string; accessToken: string } | null {
  const pageId = (config.pageId ?? config.facebookPageId ?? "").trim();
  const pageToken = (config.pageAccessToken ?? config.facebookPageAccessToken ?? "").trim();
  const accessToken = pageToken.length > 0 ? pageToken : (config.accessToken ?? "").trim();
  if (pageId.length === 0 || accessToken.length === 0) return null;
  return { pageId, accessToken };
}

/**
 * Alvo de publicação no Instagram (media container + media_publish).
 *
 * Com Facebook Login (Page token presente) o token correto contra o IG business
 * é o da Página: o token de system user devolve #100/#200 porque a permissão
 * `instagram_content_publish` vive na Página ligada ao IG. Sem Page token, cai
 * para o token geral (Instagram Login / legado).
 */
export function instagramTarget(
  config: MetaPublishConfig,
): { igUserId: string; accessToken: string } | null {
  const igUserId = config.igUserId.trim();
  const pageToken = (config.pageAccessToken ?? config.facebookPageAccessToken ?? "").trim();
  const accessToken = pageToken.length > 0 ? pageToken : config.accessToken.trim();
  if (igUserId.length === 0 || accessToken.length === 0) return null;
  return { igUserId, accessToken };
}

export function hasInstagramTarget(config: MetaPublishConfig): boolean {
  return instagramTarget(config) !== null;
}

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
  // Content publishing + private reply do Instagram sempre usam graph.facebook.com.
  // graph.instagram.com é Instagram Basic Display (somente leitura) e não publica.
  const version = config.apiVersion ?? GRAPH_API_VERSION;
  return `https://graph.facebook.com/${version}/${config.igUserId}`;
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
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    error?: GraphErrorPayload;
  } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
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
    /** IMAGE (feed), STORIES ou REELS. Default: IMAGE. */
    mediaType?: "IMAGE" | "STORIES" | "REELS";
    userTags?: readonly string[];
    fetchImpl?: typeof fetch;
  },
): Promise<PublishResult> {
  const target = instagramTarget(input);
  if (target === null) {
    return { ok: false, error: "Instagram não configurado", status: null };
  }
  const check = validateCaption(input.caption);
  if (!check.ok) return { ok: false, error: check.reason, status: null };

  const params = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption,
    media_type: input.mediaType ?? "IMAGE",
  });
  const tags = limitUserTags(input.userTags ?? []);
  if (tags.length > 0) params.set("user_tags", JSON.stringify(tags));

  return postJson(
    `${baseUrl(input)}/media?${params.toString()}`,
    target.accessToken,
    {},
    input.fetchImpl,
  );
}

/**
 * Publica uma foto na Página do Facebook: `POST /{page-id}/photos`.
 * Usa o Page token (`pages_manage_posts`) quando configurado. O id devolvido é
 * o id do post da Página (`{page-id}_{post-id}`), persistido por canal.
 */
export async function publishFacebookPagePost(
  input: MetaPublishConfig & {
    imageUrl: string;
    caption: string;
    fetchImpl?: typeof fetch;
  },
): Promise<PublishResult> {
  const target = facebookTarget(input);
  if (target === null) {
    return { ok: false, error: "Página do Facebook não configurada", status: null };
  }
  if (input.imageUrl.trim().length === 0) {
    return { ok: false, error: "post sem imagem", status: null };
  }
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const params = new URLSearchParams({ url: input.imageUrl, caption: input.caption });
  const url = `https://graph.facebook.com/${version}/${target.pageId}/photos?${params.toString()}`;
  return postJson(url, target.accessToken, {}, input.fetchImpl);
}

/** Alias de compatibilidade para o nome curto do canal. */
export const publishFacebookPost = publishFacebookPagePost;

type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNKNOWN";

interface ContainerWaitOptions {
  /** Tentativas de leitura do status antes de desistir (padrão 10). */
  maxAttempts?: number;
  /** Intervalo entre leituras em ms (padrão 3000). */
  intervalMs?: number;
  /** Injetável nos testes. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lê `GET /{container-id}?fields=status_code`. A Meta processa a imagem de forma
 * assíncrona; publicar antes de `FINISHED` devolve "Media ID is not available".
 */
async function getContainerStatus(
  input: MetaPublishConfig & { containerId: string; fetchImpl?: typeof fetch },
): Promise<
  { ok: true; status: ContainerStatus } | { ok: false; error: string; status: number | null }
> {
  const target = instagramTarget(input);
  if (target === null) {
    return { ok: false, error: "Instagram não configurado", status: null };
  }
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${input.containerId}?fields=status_code`;
  const fetcher = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${target.accessToken}` },
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }
  const payload = (await response.json().catch(() => null)) as {
    status_code?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
  }
  const known: ContainerStatus[] = ["FINISHED", "IN_PROGRESS", "ERROR", "EXPIRED", "PUBLISHED"];
  const code = payload?.status_code;
  return { ok: true, status: known.find((k) => k === code) ?? "UNKNOWN" };
}

/** Espera o container ficar `FINISHED` (ou falha em ERROR/EXPIRED/timeout). */
async function waitForContainerReady(
  input: MetaPublishConfig & {
    containerId: string;
    fetchImpl?: typeof fetch;
  } & ContainerWaitOptions,
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
  const target = instagramTarget(input);
  if (target === null) {
    return { ok: false, error: "Instagram não configurado", status: null };
  }
  const params = new URLSearchParams({ creation_id: input.creationId });
  return postJson(
    `${baseUrl(input)}/media_publish?${params.toString()}`,
    target.accessToken,
    {},
    input.fetchImpl,
  );
}

export type InstagramPublishResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status: number | null; stage: "container" | "publish" };

/** Publica uma imagem no Instagram (container + media_publish). */
export async function publishInstagramImage(
  input: MetaPublishConfig & {
    imageUrl: string;
    caption: string;
    userTags?: readonly string[];
    fetchImpl?: typeof fetch;
  },
): Promise<InstagramPublishResult> {
  if (!hasInstagramTarget(input)) {
    return { ok: false, error: "Instagram não configurado", status: null, stage: "container" };
  }
  const container = await createMediaContainer(input);
  if (!container.ok) return { ...container, stage: "container" };
  const published = await publishContainer({ ...input, creationId: container.id });
  return published.ok ? published : { ...published, stage: "publish" };
}

export interface ChannelPublicationIds {
  igMediaId?: string | null;
  fbPostId?: string | null;
}

export type SavePublicationStateResult =
  | { kind: "saved" }
  | { kind: "conflict"; error: string }
  | { kind: "failed"; error: string }
  | { kind: "migration_required"; missing: string[] };

export type ChannelPublishResult =
  | { kind: "published"; id: string; skipped: boolean }
  | { kind: "failed"; stage: "container" | "publish" | "facebook"; error: string }
  | { kind: "uncertain"; stage: "container" | "publish" | "facebook"; error: string }
  | { kind: "blocked"; reason: string; error: string }
  | { kind: "not_required" };

export function isUnknownPublishFailure(result: { error: string; status: number | null }): boolean {
  if (result.status === null || result.status === 429 || result.status >= 500) return true;
  const error = result.error.toLowerCase();
  return error.includes("resposta sem id") || error.includes("sem id");
}

export type DualPublishResult =
  | {
      kind: "published";
      instagram: Extract<ChannelPublishResult, { kind: "published" }>;
      facebook:
        | Extract<ChannelPublishResult, { kind: "published" }>
        | Extract<ChannelPublishResult, { kind: "not_required" }>;
    }
  | {
      kind: "failed";
      instagram: ChannelPublishResult;
      facebook: ChannelPublishResult;
      error: string;
    }
  | {
      kind: "uncertain";
      channel: "instagram" | "facebook";
      error: string;
      instagram: ChannelPublishResult;
      facebook: ChannelPublishResult;
    };

/**
 * Publica nos dois canais, persistindo o estado ANTES e DEPOIS de cada chamada.
 * Um estado in_flight/uncertain bloqueia republicação cega.
 */
export async function publishToChannels(
  input: MetaPublishConfig & {
    imageUrl: string;
    caption: string;
    userTags?: readonly string[];
    existing?: ChannelPublicationIds;
    initialState?: PublicationState;
    onState?: (
      state: PublicationState,
      previous: PublicationState,
    ) => Promise<SavePublicationStateResult>;
    requireFacebook?: boolean;
    fetchImpl?: typeof fetch;
  },
): Promise<DualPublishResult> {
  let state =
    input.initialState ??
    publicationStateFromLegacy({
      igMediaId: input.existing?.igMediaId,
      fbPostId: input.existing?.fbPostId,
    });

  const blockedChannel = (channel: "instagram" | "facebook"): ChannelPublishResult | null => {
    const current = state[channel];
    if (current.kind === "published") {
      return { kind: "published", id: current.id, skipped: true };
    }
    if (current.kind === "in_flight" || current.kind === "uncertain") {
      return {
        kind: "blocked",
        reason: "uncertain",
        error: `${channel} em estado ${current.kind}; reconciliação necessária`,
      };
    }
    if (current.kind === "manual_removal") {
      return {
        kind: "blocked",
        reason: "manual_removal",
        error: `${channel} exige remoção manual antes de republicar`,
      };
    }
    if (current.kind === "removed") {
      return {
        kind: "blocked",
        reason: "removed",
        error: `${channel} já foi removido; não republicar automaticamente`,
      };
    }
    return null;
  };

  const save = async (
    next: PublicationState,
    previous: PublicationState,
  ): Promise<SavePublicationStateResult> => {
    state = next;
    return input.onState === undefined ? { kind: "saved" } : input.onState(next, previous);
  };

  let instagram: ChannelPublishResult;
  const igSettled = blockedChannel("instagram");
  if (igSettled !== null) {
    instagram = igSettled;
  } else if (!hasInstagramTarget(input)) {
    instagram = {
      kind: "blocked",
      reason: "missing_credentials",
      error: "Instagram não configurado",
    };
  } else {
    const previous = state;
    const inflight = await save(
      setChannelState(previous, "instagram", { kind: "in_flight" }),
      previous,
    );
    if (inflight.kind === "conflict") {
      return {
        kind: "failed",
        instagram: { kind: "blocked", reason: "conflict", error: inflight.error },
        facebook: { kind: "not_required" },
        error: inflight.error,
      };
    }
    if (inflight.kind !== "saved") {
      return {
        kind: "uncertain",
        channel: "instagram",
        error:
          inflight.kind === "migration_required" ? inflight.missing.join(", ") : inflight.error,
        instagram: {
          kind: "blocked",
          reason: "persistence",
          error: "estado in_flight não persistido",
        },
        facebook: { kind: "not_required" },
      };
    }
    const result = await publishInstagramImage({
      ...input,
      imageUrl: input.imageUrl,
      caption: input.caption,
      userTags: input.userTags,
    });
    if (result.ok) {
      const beforePublish = state;
      const saved = await save(
        setChannelState(beforePublish, "instagram", { kind: "published", id: result.id }),
        beforePublish,
      );
      if (saved.kind !== "saved") {
        return {
          kind: "uncertain",
          channel: "instagram",
          error: saved.kind === "migration_required" ? saved.missing.join(", ") : saved.error,
          instagram: { kind: "published", id: result.id, skipped: false },
          facebook: { kind: "not_required" },
        };
      }
      instagram = { kind: "published", id: result.id, skipped: false };
    } else if (isUnknownPublishFailure(result)) {
      const beforeFailure = state;
      await save(
        setChannelState(beforeFailure, "instagram", {
          kind: "uncertain",
          reason: result.error,
        }),
        beforeFailure,
      );
      return {
        kind: "uncertain",
        channel: "instagram",
        error: result.error,
        instagram: { kind: "uncertain", stage: result.stage, error: result.error },
        facebook: { kind: "blocked", reason: "instagram_uncertain", error: result.error },
      };
    } else {
      const beforeFailure = state;
      await save(
        setChannelState(beforeFailure, "instagram", {
          kind: "failed",
          error: result.error,
        }),
        beforeFailure,
      );
      instagram = { kind: "failed", stage: result.stage, error: result.error };
    }
  }

  const target = facebookTarget(input);
  let facebook: ChannelPublishResult;
  const fbSettled = blockedChannel("facebook");
  if (fbSettled !== null) {
    facebook = fbSettled;
  } else if (target === null && input.requireFacebook === true) {
    facebook = {
      kind: "blocked",
      reason: "missing_credentials",
      error: "Página do Facebook não configurada",
    };
  } else if (target === null) {
    facebook = { kind: "not_required" };
  } else {
    const previousFb = state;
    const inflight = await save(
      setChannelState(previousFb, "facebook", { kind: "in_flight" }),
      previousFb,
    );
    if (inflight.kind === "conflict") {
      return {
        kind: "failed",
        instagram,
        facebook: { kind: "blocked", reason: "conflict", error: inflight.error },
        error: inflight.error,
      };
    }
    if (inflight.kind !== "saved") {
      return {
        kind: "uncertain",
        channel: "facebook",
        error:
          inflight.kind === "migration_required" ? inflight.missing.join(", ") : inflight.error,
        instagram,
        facebook: {
          kind: "blocked",
          reason: "persistence",
          error: "estado in_flight não persistido",
        },
      };
    }
    const result = await publishFacebookPagePost({
      ...input,
      imageUrl: input.imageUrl,
      caption: input.caption,
      fetchImpl: input.fetchImpl,
    });
    if (result.ok) {
      const beforeFbPublish = state;
      const saved = await save(
        setChannelState(beforeFbPublish, "facebook", { kind: "published", id: result.id }),
        beforeFbPublish,
      );
      if (saved.kind !== "saved") {
        return {
          kind: "uncertain",
          channel: "facebook",
          error: saved.kind === "migration_required" ? saved.missing.join(", ") : saved.error,
          instagram,
          facebook: { kind: "published", id: result.id, skipped: false },
        };
      }
      facebook = { kind: "published", id: result.id, skipped: false };
    } else if (isUnknownPublishFailure(result)) {
      const beforeFbFailure = state;
      await save(
        setChannelState(beforeFbFailure, "facebook", {
          kind: "uncertain",
          reason: result.error,
        }),
        beforeFbFailure,
      );
      return {
        kind: "uncertain",
        channel: "facebook",
        error: result.error,
        instagram,
        facebook: { kind: "uncertain", stage: "facebook", error: result.error },
      };
    } else {
      const beforeFbFailure = state;
      await save(
        setChannelState(beforeFbFailure, "facebook", { kind: "failed", error: result.error }),
        beforeFbFailure,
      );
      facebook = { kind: "failed", stage: "facebook", error: result.error };
    }
  }

  if (instagram.kind === "published" && facebook.kind === "published") {
    return { kind: "published", instagram, facebook };
  }
  if (instagram.kind === "published" && facebook.kind === "not_required") {
    return { kind: "published", instagram, facebook };
  }
  const errors = [instagram, facebook]
    .map((channel) =>
      channel.kind === "failed" || channel.kind === "blocked" || channel.kind === "uncertain"
        ? channel.error
        : null,
    )
    .filter((error): error is string => error !== null);
  return {
    kind: "failed",
    instagram,
    facebook,
    error: errors.join("; ") || "falha ao publicar em um dos canais",
  };
}

function classifyDeleteFailure(
  channel: RemoteChannel,
  status: number,
  payload: GraphDeleteResponse | null,
): RemoteDeleteOutcome {
  const error = payload?.error;
  const message = error?.message ?? `HTTP ${String(status)}`;
  const code = error?.code;
  const subcode = error?.error_subcode ?? error?.subcode;
  const lower = message.toLowerCase();

  if (status === 401 || status === 403 || code === 190 || code === 10 || code === 200) {
    return { kind: "permission_or_token", channel, error: message };
  }
  if (status === 429 || status >= 500) {
    return { kind: "transient", channel, error: message };
  }
  if (lower.includes("unsupported") || lower.includes("not supported")) {
    return { kind: "unsupported", channel, error: message };
  }
  if (lower.includes("permission") || lower.includes("scope")) {
    return { kind: "missing_permission", channel, error: message };
  }
  // 404 / "not found" / code 100/33 NÃO provam ausência: a Meta usa os mesmos
  // sinais para permissão/objeto inacessível. Só um success:true confirma.
  if (
    status === 404 ||
    code === 100 ||
    subcode === 33 ||
    lower.includes("not found") ||
    lower.includes("does not exist")
  ) {
    return { kind: "not_confirmed_absent", channel, error: message };
  }
  return { kind: "unknown", channel, error: message };
}

async function deleteRemoteObject(
  channel: RemoteChannel,
  url: string,
  accessToken: string,
  id: string,
  fetchImpl: typeof fetch | undefined,
): Promise<RemoteDeleteOutcome> {
  const fetcher = fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    return { kind: "transient", channel, error: String(error) };
  }

  const raw: unknown = await response.json().catch(() => null);
  const parsed = graphDeleteResponseSchema.safeParse(raw);
  const payload = parsed.success ? parsed.data : null;

  if (response.ok) {
    if (payload?.success === true) return { kind: "deleted", channel, id };
    return {
      kind: "not_confirmed_absent",
      channel,
      error: "HTTP 2xx sem success:true — remoção não confirmada",
    };
  }
  return classifyDeleteFailure(channel, response.status, payload);
}

/**
 * Exclui uma mídia publicada — `DELETE /{ig-media-id}`.
 * Suportado apenas em graph.facebook.com (Facebook Login; usa o Page token
 * quando disponível). Instagram Login (graph.instagram.com) é `unsupported`.
 */
export async function deleteMedia(
  input: MetaPublishConfig & { mediaId: string; fetchImpl?: typeof fetch },
): Promise<RemoteDeleteOutcome> {
  const target = instagramTarget(input);
  if (target === null) {
    return {
      kind: "missing_credentials",
      channel: "instagram",
      error: "credenciais do Instagram ausentes",
    };
  }
  // graph.instagram.com (Instagram Login / Basic Display) não publica nem exclui
  // conteúdo; DELETE só existe em graph.facebook.com (Facebook Login).
  if ((input.apiHost ?? "graph.facebook.com") !== "graph.facebook.com") {
    return {
      kind: "unsupported",
      channel: "instagram",
      error: "DELETE do Instagram exige graph.facebook.com com Facebook Login",
    };
  }
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${input.mediaId}`;
  return deleteRemoteObject("instagram", url, target.accessToken, input.mediaId, input.fetchImpl);
}

/**
 * Exclui um post da Página do Facebook — `DELETE /{post-id}`.
 * Só `success:true` confirma; falha real fica pendente.
 */
export async function deleteFacebookPost(
  input: MetaPublishConfig & { postId: string; fetchImpl?: typeof fetch },
): Promise<RemoteDeleteOutcome> {
  const target = facebookTarget(input);
  if (target === null) {
    return {
      kind: "missing_credentials",
      channel: "facebook",
      error: "Página/token do Facebook ausente",
    };
  }
  const version = input.apiVersion ?? GRAPH_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${input.postId}`;
  return deleteRemoteObject("facebook", url, target.accessToken, input.postId, input.fetchImpl);
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
