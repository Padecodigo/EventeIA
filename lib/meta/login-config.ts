/**
 * Resolução da configuração do Facebook Login for Business (server-only).
 * Fail-closed: com a flag desligada, sem segredo/chave ou sem origem canônica,
 * retorna null e a rota erra em vez de chamar a Meta sem credencial.
 */

import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";
import { tiktokCanonicalOrigin } from "@/lib/tiktok/config";

export interface MetaLoginConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  apiVersion: string;
  configId: string | null;
  encryptionKey: string;
}

/** Flag de feature: por padrão desligada. */
export function metaLoginEnabled(): boolean {
  return serverEnv().META_LOGIN_ENABLED === true;
}

/**
 * Redirect URI do login Meta. Só aceita override no MESMO origin canônico;
 * caso contrário deriva `${origem}/meta/callback`. Sem origem, null.
 */
function resolveMetaRedirectUri(canonicalOrigin: string): string {
  const configured = serverEnv().META_REDIRECT_URI;
  if (isConfigured(configured)) {
    try {
      const url = new URL(configured.trim());
      if (url.origin === canonicalOrigin) return configured.trim();
    } catch {
      // override inválido — cai no derivado abaixo
    }
  }
  return new URL("/meta/callback", canonicalOrigin).toString();
}

/** Config completa do login Meta; null = não configurado (fail-closed). */
export function metaLoginConfig(): MetaLoginConfig | null {
  if (!metaLoginEnabled()) return null;

  const env = serverEnv();
  if (!isConfigured(env.META_APP_SECRET) || !isConfigured(env.META_TOKEN_ENCRYPTION_KEY)) {
    return null;
  }

  const origin = tiktokCanonicalOrigin();
  if (origin === null) return null;

  const configId = isConfigured(env.META_LOGIN_CONFIG_ID) ? env.META_LOGIN_CONFIG_ID.trim() : null;

  return {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: resolveMetaRedirectUri(origin),
    apiVersion: env.META_API_VERSION ?? "v26.0",
    configId: configId !== null && configId.length > 0 ? configId : null,
    encryptionKey: env.META_TOKEN_ENCRYPTION_KEY,
  };
}
