import type { MetaPublishConfig } from "./publishing";

/**
 * Configuração de publicação Meta a partir de variáveis de ambiente.
 *
 * A Página do Facebook é opcional no tipo para não quebrar quem só tem
 * Instagram, mas o fluxo de evento exige as duas pontas (`requireFacebook`).
 */
export interface MetaEnvLike {
  META_ACCESS_TOKEN?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_PAGE_ID?: string;
  META_INSTAGRAM_BUSINESS_ID?: string;
  META_API_VERSION?: string;
  META_API_HOST?: "graph.facebook.com" | "graph.instagram.com";
}

export function metaPublishConfigFromEnv(env: MetaEnvLike): MetaPublishConfig {
  const pageToken = (env.META_PAGE_ACCESS_TOKEN ?? "").trim();
  const accessToken = (env.META_ACCESS_TOKEN ?? "").trim();
  return {
    igUserId: (env.META_INSTAGRAM_BUSINESS_ID ?? "").trim(),
    accessToken,
    pageId: (env.META_PAGE_ID ?? "").trim(),
    pageAccessToken: pageToken.length > 0 ? pageToken : accessToken,
    apiVersion: env.META_API_VERSION,
    apiHost: env.META_API_HOST,
  };
}

/** Configuração a partir de `process.env` (workers/cancelamento). Nunca lança. */
export function metaPublishConfigFromProcessEnv(): MetaPublishConfig | null {
  const config = metaPublishConfigFromEnv(process.env as unknown as MetaEnvLike);
  return config.igUserId.length > 0 ||
    config.accessToken.length > 0 ||
    (config.pageId ?? "").length > 0
    ? config
    : null;
}
