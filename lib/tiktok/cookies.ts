/**
 * Cookies do fluxo OAuth do TikTok: state + code_verifier (httpOnly, SameSite=Lax,
 * Secure em produção, TTL curto ~10 min) amarrados à sessão.
 */

import type { NextResponse } from "next/server";

export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";
export const TIKTOK_VERIFIER_COOKIE = "tiktok_oauth_verifier";

/** TTL curto (10 min) para limitar a janela de um ataque de fixação de state. */
export const TIKTOK_OAUTH_TTL_SECONDS = 600;

/** Caminho restrito ao fluxo /tiktok/* (o cookie não vaza para outras rotas). */
const COOKIE_PATH = "/tiktok";

export function tiktokOauthCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // Secure em produção; em dev (http://localhost) um cookie Secure nunca
    // retornaria — mesmo critério de SESSION_COOKIE_OPTIONS em lib/auth/session-ttl.ts.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: TIKTOK_OAUTH_TTL_SECONDS,
  };
}

/** Apaga os cookies do fluxo (tanto no sucesso quanto no erro). */
export function clearTiktokOauthCookies(response: NextResponse): void {
  response.cookies.delete({ name: TIKTOK_STATE_COOKIE, path: COOKIE_PATH });
  response.cookies.delete({ name: TIKTOK_VERIFIER_COOKIE, path: COOKIE_PATH });
}
