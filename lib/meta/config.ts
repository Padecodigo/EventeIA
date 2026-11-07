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
  const pageId = (env.META_PAGE_ID ?? "").trim();
  // Facebook Login (Page token/Page id) publica e exclui conteúdo no Instagram
  // via graph.facebook.com. graph.instagram.com é Instagram Basic Display
  // (somente leitura) e não publica conteúdo — só vale sem contexto de Página.
  const facebookLogin = pageToken.length > 0 || pageId.length > 0;
  return {
    igUserId: (env.META_INSTAGRAM_BUSINESS_ID ?? "").trim(),
    accessToken,
    pageId,
    pageAccessToken: pageToken.length > 0 ? pageToken : accessToken,
    apiVersion: env.META_API_VERSION,
    apiHost: facebookLogin ? "graph.facebook.com" : env.META_API_HOST,
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
