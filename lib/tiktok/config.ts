/**
 * Resolução de credenciais/ambiente do TikTok (server-only).
 * Fail-closed: rota que precisar da chave/secret do ambiente ativo e não tiver
 * recebe null e redireciona/erra em vez de chamar a API sem credencial.
 */

import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";

export type TiktokEnvironment = "sandbox" | "production";

export interface TiktokCredentials {
  clientKey: string;
  clientSecret: string;
  environment: TiktokEnvironment;
}

const BIND_HOSTNAMES = new Set(["0.0.0.0", "[::]", "::"]);

/**
 * URL absoluta http(s) sem credenciais/fragmento e sem bind host.
 * A proveniência é sempre config de servidor; headers de proxy não entram aqui.
 */
function parseTrustedUrl(raw: string | undefined): URL | null {
  if (!isConfigured(raw)) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname.length === 0 || BIND_HOSTNAMES.has(url.hostname.toLowerCase())) return null;
    if (url.username.length > 0 || url.password.length > 0) return null;
    if (url.hash.length > 0) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Origem canônica do app para redirects do TikTok.
 * Só NEXT_PUBLIC_APP_URL (config de servidor); x-forwarded-* nunca é confiável aqui.
 * Sem uma origem canônica válida, o chamador deve falhar fechado.
 */
export function tiktokCanonicalOrigin(): string | null {
  const url = parseTrustedUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (url === null || url.search.length > 0) return null;
  return url.origin;
}

/** Credenciais do ambiente ativo; null = não configurado (fail-closed). */
export function tiktokCredentials(): TiktokCredentials | null {
  const env = serverEnv();
  const environment: TiktokEnvironment = env.TIKTOK_ENV;
  const clientKey =
    environment === "production" ? env.TIKTOK_CLIENT_KEY : env.TIKTOK_SANDBOX_CLIENT_KEY;
  const clientSecret =
    environment === "production" ? env.TIKTOK_CLIENT_SECRET : env.TIKTOK_SANDBOX_CLIENT_SECRET;

  if (!isConfigured(clientKey) || !isConfigured(clientSecret)) {
    return null;
  }
  return { clientKey, clientSecret, environment };
}

/**
 * Redirect URI exato registrado no app TikTok. Só aceita override no MESMO
 * origin canônico; caso contrário deriva `${TIKTOK_CANONICAL_ORIGIN}/tiktok/callback`.
 * Sem origem canônica, retorna null (fail-closed) independentemente de headers.
 */
export function resolveTiktokRedirectUri(
  _headers?: Pick<Headers, "get">,
  _requestUrl?: string,
): string | null {
  const canonicalOrigin = tiktokCanonicalOrigin();
  if (canonicalOrigin === null) return null;

  const configured = serverEnv().TIKTOK_REDIRECT_URI;
  if (isConfigured(configured)) {
    const url = parseTrustedUrl(configured);
    if (url !== null && url.origin === canonicalOrigin) return configured.trim();
  }
  return new URL("/tiktok/callback", canonicalOrigin).toString();
}
