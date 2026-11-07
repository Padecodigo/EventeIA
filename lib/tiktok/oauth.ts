/**
 * Login Kit do TikTok — utilitários puros (OAuth 2.0 + PKCE).
 * Sem dependências de servidor/framework: testável em unidade.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Escopos solicitados no fluxo de conexão.
 * Draft-only: `video.upload` (sobe como rascunho/inbox para revisão humana).
 * `video.publish` (postagem direta) é INTENCIONALMENTE omitido — o app nunca
 * publica sem aprovação de um admin.
 */
export const TIKTOK_SCOPE = "user.info.basic,video.upload";

export interface PkcePair {
  /** code_verifier: string aleatória base64url (guardada em cookie httpOnly). */
  verifier: string;
  /** code_challenge: base64url(SHA-256(verifier)) — S256. */
  challenge: string;
}

/** Base do fluxo OAuth (authorize). */
export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

/** Base da API (Content Posting / OAuth token / User Info). */
export const TIKTOK_API_BASE = "https://open.tiktokapis.com";

/** Deriva o code_challenge S256 de um code_verifier. */
export function s256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Gera code_verifier (64 bytes aleatórios → base64url) + code_challenge S256. */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: s256Challenge(verifier) };
}

/** Gera um state aleatório (>= 32 bytes → base64url), anti-CSRF. */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

export interface BuildAuthorizeUrlInput {
  clientKey: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

/** Monta a URL de autorização exata do TikTok (https://www.tiktok.com/v2/auth/authorize/). */
export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("client_key", input.clientKey);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Comparação em tempo constante (anti-timing para o state). */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual lança se os tamanhos diferem; comprimentos distintos já
  // revelam que são diferentes (sem risco prático de timing nesta validação).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
