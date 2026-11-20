import { type NextRequest, NextResponse } from "next/server";

import { isAdminUser, requireUser } from "@/lib/auth";
import { saveMetaUserGrant } from "@/lib/meta/connection-store";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchGrantedScopes,
  fetchMe,
} from "@/lib/meta/graph-login";
import { metaLoginConfig } from "@/lib/meta/login-config";
import { META_OAUTH_COOKIE_PATH, META_STATE_COOKIE } from "@/lib/meta/oauth";
import { tiktokCanonicalOrigin } from "@/lib/tiktok/config";
import { constantTimeEqual } from "@/lib/tiktok/oauth";

export const runtime = "nodejs";

function originNotConfigured(): NextResponse {
  return NextResponse.json({ error: "meta_origin_not_configured" }, { status: 500 });
}

/** Redirect interno só na origem canônica de servidor; bind host nunca é usado. */
function internalRedirect(path: string): NextResponse {
  const origin = tiktokCanonicalOrigin();
  if (origin === null) return originNotConfigured();
  return NextResponse.redirect(new URL(path, origin));
}

/** Destino admin + status legível pela página (nunca o code nem tokens). */
function adminRedirect(status: string): NextResponse {
  return internalRedirect(`/admin/meta?meta=${encodeURIComponent(status)}`);
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.delete({ name: META_STATE_COOKIE, path: META_OAUTH_COOKIE_PATH });
}

/**
 * GET /meta/callback — conclui o Facebook Login: valida state (tempo constante),
 * troca o code por token (server-side), busca dados do usuário e grava a conexão.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  // Cancelamento/erro da Meta (access_denied / user_denied): sem code, volta ao admin.
  const oauthError = searchParams.get("error");
  if (oauthError !== null) {
    const errorReason = searchParams.get("error_reason");
    const cancelled = oauthError === "access_denied" || errorReason === "user_denied";
    const response = adminRedirect(cancelled ? "cancelado" : "erro");
    clearStateCookie(response);
    return response;
  }

  // State obrigatório + comparação em tempo constante contra o cookie.
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(META_STATE_COOKIE)?.value ?? "";
  if (state === null || !constantTimeEqual(state, expectedState)) {
    // Sem troca de token: nunca chamamos a Meta com um state inválido/ausente.
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // Sessão válida + admin (o fluxo é restrito a administradores).
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) {
    return internalRedirect("/painel");
  }

  const code = searchParams.get("code");
  if (code === null) {
    const response = adminRedirect("erro");
    clearStateCookie(response);
    return response;
  }

  const config = metaLoginConfig();
  if (config === null) {
    const response = adminRedirect("erro_config");
    clearStateCookie(response);
    return response;
  }

  const shortResult = await exchangeCodeForUserToken({
    code,
    appId: config.appId,
    appSecret: config.appSecret,
    redirectUri: config.redirectUri,
    apiVersion: config.apiVersion,
  });

  if (!shortResult.ok) {
    const response = adminRedirect("erro_troca");
    clearStateCookie(response);
    return response;
  }

  // Tenta trocar pelo token de longa duração; se falhar, mantém o token curto.
  let userToken = shortResult.data.accessToken;
  let expiresIn = shortResult.data.expiresIn;
  const longResult = await exchangeForLongLivedUserToken({
    userToken: shortResult.data.accessToken,
    appId: config.appId,
    appSecret: config.appSecret,
    apiVersion: config.apiVersion,
  });
  if (longResult.ok) {
    userToken = longResult.data.accessToken;
    expiresIn = longResult.data.expiresIn;
  }

  const meResult = await fetchMe({ userToken, apiVersion: config.apiVersion });
  if (!meResult.ok) {
    const response = adminRedirect("erro_troca");
    clearStateCookie(response);
    return response;
  }

  const scopesResult = await fetchGrantedScopes({
    userToken,
    apiVersion: config.apiVersion,
  });
  const scopes = scopesResult.ok ? scopesResult.data : [];

  const expiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

  try {
    await saveMetaUserGrant({
      connectedBy: user.id,
      fbUserId: meResult.data.id,
      fbUserName: meResult.data.name,
      userToken,
      userTokenExpiresAt: expiresAt,
      scopes,
    });
  } catch {
    const response = adminRedirect("erro_gravar");
    clearStateCookie(response);
    return response;
  }

  const response = adminRedirect("conectado");
  clearStateCookie(response);
  return response;
}
