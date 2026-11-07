/**
 * Resolução de credenciais/ambiente do TikTok (server-only).
 * Fail-closed: rota que precisar da chave/secret do ambiente ativo e não tiver
 * recebe null e redireciona/erra em vez de chamar a API sem credencial.
 */

import "server-only";

import { publicOrigin } from "@/lib/auth/oauth";
import { isConfigured, serverEnv } from "@/lib/env";

export type TiktokEnvironment = "sandbox" | "production";

export interface TiktokCredentials {
  clientKey: string;
  clientSecret: string;
  environment: TiktokEnvironment;
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
 * Redirect URI exato registrado no app TikTok. Sem TIKTOK_REDIRECT_URI,
 * deriva de NEXT_PUBLIC_APP_URL (ou da origem pública via proxy headers) + /tiktok/callback.
 */
export function resolveTiktokRedirectUri(
  headers: Pick<Headers, "get">,
  requestUrl: string,
): string {
  const configured = serverEnv().TIKTOK_REDIRECT_URI;
  if (isConfigured(configured)) return configured;
  const origin = publicOrigin(headers, requestUrl);
  return new URL("/tiktok/callback", origin).toString();
}
