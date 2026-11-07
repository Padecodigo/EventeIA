import { nextVersionTimestamp } from "./version-timestamp";
import {
  isChannelSettled,
  setChannelState,
  stateFromImageParams,
  withPublicationState,
  type PublicationState,
} from "./publication-state";

/**
 * Publicação feita pelo navegador (Playwright) NÃO devolve o media id da Graph
 * API — só o permalink/shortcode. O link fica no JSON tipado
 * (`image_params.publication`) e `ig_media_id` recebe apenas um sentinela
 * explícito para preservar a linha; nunca o shortcode.
 */

export const BROWSER_MANUAL_IG_ID = "browser-manual";
import { LEGACY_MANUAL_REMOVAL_PREFIX } from "./publication-state";

const LEGACY_MANUAL_PREFIX = LEGACY_MANUAL_REMOVAL_PREFIX;

export interface BrowserPublicationInfo {
  permalink: string | null;
  shortcode: string | null;
}

export interface ManualRemovalInfo {
  kind: "manual_removal";
  permalink: string | null;
  reason: string;
}

/** Compatibilidade de leitura com linhas antigas; nunca gravamos neste formato. */
function legacyLinkFromError(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !value.startsWith(LEGACY_MANUAL_PREFIX)) {
    return undefined;
  }
  const link = value.slice(LEGACY_MANUAL_PREFIX.length).trim();
  return link.length > 0 ? link : null;
}

/** Media ids da Graph API são numéricos; shortcode/permalink não são. */
export function isGraphInstagramMediaId(value: string | null | undefined): boolean {
  return /^\d+$/.test((value ?? "").trim());
}

export function manualRemovalFromImageParams(imageParams: unknown): ManualRemovalInfo | null {
  const state = stateFromImageParams(imageParams);
  if (state.instagram.kind === "manual_removal") {
    return {
      kind: "manual_removal",
      permalink: state.instagram.link,
      reason: "publicado pelo navegador; a Graph API não expõe o media id para DELETE",
    };
  }
  return null;
}

/**
 * Linha que não pode ser apagada pela API:
 * marcador `browser-manual`, id não numérico (shortcode legado), JSON tipado de
 * remoção manual ou marcador textual legado no campo `error`.
 */
export function manualRemovalFromRow(row: {
  igMediaId?: string | null;
  error?: string | null;
  imageParams?: unknown;
}): ManualRemovalInfo | null {
  const igId = (row.igMediaId ?? "").trim();
  const fromJson = manualRemovalFromImageParams(row.imageParams);
  const legacyError = legacyLinkFromError(row.error);
  const legacyShortcode = igId.length > 0 && !isGraphInstagramMediaId(igId);

  if (fromJson !== null) return fromJson;
  if (igId === BROWSER_MANUAL_IG_ID || legacyShortcode) {
    return {
      kind: "manual_removal",
      permalink: legacyError === undefined ? null : legacyError,
      reason:
        igId === BROWSER_MANUAL_IG_ID
          ? "publicação do navegador sem media id da Graph API"
          : "id do Instagram não parece um media id numérico da Graph API",
    };
  }
  if (legacyError !== undefined) {
    return {
      kind: "manual_removal",
      permalink: legacyError,
      reason: "registro legado com remoção manual pendente",
    };
  }
  return null;
}

/** Estado tipado após publicar pelo navegador. */
export function browserPublicationState(
  state: PublicationState,
  info: BrowserPublicationInfo,
): PublicationState {
  return setChannelState(state, "instagram", {
    kind: "manual_removal",
    link: info.permalink,
  });
}

interface BrowserPublishDb {
  from(table: "prospecting_posts"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { image_params?: unknown; updated_at?: string | null } | null;
        }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          select(columns: string): Promise<{
            data: { id: string }[] | null;
            error: { code?: string } | null;
          }>;
        };
      };
    };
  };
}

/** Persiste a publicação do navegador no post do evento (nunca no `ig_media_id`). */
export async function persistBrowserEventPublication(
  db: BrowserPublishDb,
  input: { postId: string; permalink: string | null; shortcode: string | null; now?: Date },
): Promise<void> {
  const { data } = await db
    .from("prospecting_posts")
    .select("image_params,updated_at")
    .eq("id", input.postId)
    .maybeSingle();
  if (data === null || typeof data.updated_at !== "string") {
    throw new Error("post do navegador sem updated_at para CAS");
  }
  const state = browserPublicationState(stateFromImageParams(data.image_params), {
    permalink: input.permalink,
    shortcode: input.shortcode,
  });
  const now = input.now ?? new Date();
  const { data: updated, error } = await db
    .from("prospecting_posts")
    .update({
      status: "published",
      ig_media_id: BROWSER_MANUAL_IG_ID,
      published_at: now.toISOString(),
      image_params: withPublicationState(data.image_params, state),
      updated_at: nextVersionTimestamp(data.updated_at, now),
    })
    .eq("id", input.postId)
    .eq("updated_at", data.updated_at)
    .select("id");
  if (error !== null)
    throw new Error(`falha ao persistir publicação do navegador (${error.code ?? "?"})`);
  if (updated === null || updated.length === 0) {
    throw new Error("conflito ao persistir publicação do navegador");
  }
}

export function hasUnsettledInstagram(state: PublicationState): boolean {
  return !isChannelSettled(state.instagram);
}
