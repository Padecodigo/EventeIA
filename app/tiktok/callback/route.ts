import { type NextRequest, NextResponse } from "next/server";

import { isAdminUser, requireUser } from "@/lib/auth";
import { creatorInfo, exchangeCodeForToken } from "@/lib/tiktok/client";
import { tiktokCredentials, resolveTiktokRedirectUri } from "@/lib/tiktok/config";
import {
  clearTiktokOauthCookies,
  TIKTOK_STATE_COOKIE,
  TIKTOK_VERIFIER_COOKIE,
} from "@/lib/tiktok/cookies";
import { constantTimeEqual } from "@/lib/tiktok/oauth";
import { saveTiktokAccount } from "@/lib/tiktok/store";

export const runtime = "nodejs";

/** Destino admin + status legível pela página (nunca o code nem tokens). */
function adminRedirect(request: NextRequest, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/tiktok?tiktok=${status}`, request.url));
}

/**
 * GET /tiktok/callback — conclui o Login Kit: valida state (tempo constante),
 * troca o code por tokens (server-side) e grava a conta conectada (draft-only).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  // Cancelamento/erro do TikTok (access_denied etc.): sem code, volta ao admin.
  const oauthError = searchParams.get("error");
  if (oauthError !== null) {
    const status = oauthError === "access_denied" ? "cancelado" : "erro";
    const response = adminRedirect(request, status);
    clearTiktokOauthCookies(response);
    return response;
  }

  // State obrigatório + comparação em tempo constante contra o cookie (10 min).
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(TIKTOK_STATE_COOKIE)?.value ?? "";
  if (state === null || !constantTimeEqual(state, expectedState)) {
    // Sem troca de token: nunca chamamos o TikTok com um state inválido/ausente.
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // Sessão válida + admin (o fluxo é restrito a administradores).
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  const code = searchParams.get("code");
  const verifier = request.cookies.get(TIKTOK_VERIFIER_COOKIE)?.value ?? "";
  if (code === null || verifier.length === 0) {
    const response = adminRedirect(request, "erro");
    clearTiktokOauthCookies(response);
    return response;
  }

  const credentials = tiktokCredentials();
  if (credentials === null) {
    const response = adminRedirect(request, "erro_config");
    clearTiktokOauthCookies(response);
    return response;
  }

  const redirectUri = resolveTiktokRedirectUri(request.headers, request.url);

  const tokenResult = await exchangeCodeForToken({
    code,
    clientKey: credentials.clientKey,
    clientSecret: credentials.clientSecret,
    redirectUri,
    codeVerifier: verifier,
  });

  if (!tokenResult.ok) {
    const response = adminRedirect(request, "erro_troca");
    clearTiktokOauthCookies(response);
    return response;
  }

  const token = tokenResult.data;

  // Dados públicos do criador (best-effort; não bloqueia a conexão).
  const info = await creatorInfo({ accessToken: token.access_token });
  const displayName = info.ok ? info.data.display_name ?? null : null;
  const avatarUrl = info.ok ? info.data.avatar_url ?? null : null;

  const expiresAt =
    typeof token.expires_in === "number" && token.expires_in > 0
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

  try {
    await saveTiktokAccount({
      ownerProfileId: user.id,
      environment: credentials.environment,
      openId: token.open_id,
      displayName,
      avatarUrl,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scopes: (token.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      expiresAt,
    });
  } catch {
    const response = adminRedirect(request, "erro_gravar");
    clearTiktokOauthCookies(response);
    return response;
  }

  const response = adminRedirect(request, "conectado");
  clearTiktokOauthCookies(response);
  return response;
}
