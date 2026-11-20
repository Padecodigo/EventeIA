import { type NextRequest, NextResponse } from "next/server";

import { isAdminUser, requireUser } from "@/lib/auth";
import { metaLoginConfig } from "@/lib/meta/login-config";
import { buildMetaAuthorizeUrl, META_STATE_COOKIE, metaOauthCookieOptions } from "@/lib/meta/oauth";
import { tiktokCanonicalOrigin as canonicalOrigin } from "@/lib/tiktok/config";
import { generateState } from "@/lib/tiktok/oauth";

export const runtime = "nodejs";

function originNotConfigured(): NextResponse {
  return NextResponse.json({ error: "meta_origin_not_configured" }, { status: 500 });
}

/**
 * GET /meta/connect — inicia o Facebook Login for Business (Meta).
 * Admin only. Gera state, guarda em cookie httpOnly e redireciona ao authorize da Meta.
 */
export async function GET(_request?: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) {
    const origin = canonicalOrigin();
    return origin === null
      ? originNotConfigured()
      : NextResponse.redirect(new URL("/painel", origin));
  }

  const origin = canonicalOrigin();
  if (origin === null) return originNotConfigured();

  const config = metaLoginConfig();
  if (config === null) {
    return NextResponse.redirect(new URL("/admin/meta?meta=erro_config", origin));
  }

  const state = generateState();

  const authorizeUrl = buildMetaAuthorizeUrl({
    appId: config.appId,
    redirectUri: config.redirectUri,
    state,
    apiVersion: config.apiVersion,
    configId: config.configId,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(META_STATE_COOKIE, state, metaOauthCookieOptions());
  return response;
}
