import { type NextRequest, NextResponse } from "next/server";

import { isAdminUser, requireUser } from "@/lib/auth";
import { tiktokCredentials, resolveTiktokRedirectUri } from "@/lib/tiktok/config";
import { tiktokOauthCookieOptions, TIKTOK_STATE_COOKIE, TIKTOK_VERIFIER_COOKIE } from "@/lib/tiktok/cookies";
import { buildAuthorizeUrl, generatePkce, generateState, TIKTOK_SCOPE } from "@/lib/tiktok/oauth";

export const runtime = "nodejs";

/**
 * GET /tiktok/connect — inicia o Login Kit do TikTok (OAuth 2.0 + PKCE).
 * Admin only. Gera state + code_verifier, guarda em cookies httpOnly (10 min)
 * e redireciona para o authorize do TikTok.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  // Fail-closed: sem chave/secret do ambiente ativo, não inicia o fluxo.
  const credentials = tiktokCredentials();
  if (credentials === null) {
    return NextResponse.redirect(new URL("/admin/tiktok?tiktok=erro_config", request.url));
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const redirectUri = resolveTiktokRedirectUri(request.headers, request.url);

  const authorizeUrl = buildAuthorizeUrl({
    clientKey: credentials.clientKey,
    redirectUri,
    scope: TIKTOK_SCOPE,
    state,
    codeChallenge: challenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  const options = tiktokOauthCookieOptions();
  response.cookies.set(TIKTOK_STATE_COOKIE, state, options);
  response.cookies.set(TIKTOK_VERIFIER_COOKIE, verifier, options);
  return response;
}
