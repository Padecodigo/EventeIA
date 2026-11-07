import { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rotas do TikTok (offline): state inválido/ausente/expirado ⇒ 400 sem troca de
 * token; não-admin negado; credencial ausente ⇒ fail-closed.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isAdminUser: vi.fn(),
  tiktokCredentials: vi.fn(),
  resolveTiktokRedirectUri: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  creatorInfo: vi.fn(),
  saveTiktokAccount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  isAdminUser: mocks.isAdminUser,
}));

vi.mock("@/lib/tiktok/config", () => ({
  tiktokCredentials: mocks.tiktokCredentials,
  resolveTiktokRedirectUri: mocks.resolveTiktokRedirectUri,
}));

vi.mock("@/lib/tiktok/client", () => ({
  exchangeCodeForToken: mocks.exchangeCodeForToken,
  creatorInfo: mocks.creatorInfo,
}));

vi.mock("@/lib/tiktok/store", () => ({
  saveTiktokAccount: mocks.saveTiktokAccount,
}));

import { GET as connectGET } from "@/app/tiktok/connect/route";
import { GET as callbackGET } from "@/app/tiktok/callback/route";

const ADMIN = { id: "u-admin", email: "admin@eventeia.com" };

function callbackReq(query: string, cookie = ""): NextRequest {
  return new NextRequest(`http://localhost:3100/tiktok/callback?${query}`, {
    headers: cookie.length > 0 ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(ADMIN);
  mocks.isAdminUser.mockResolvedValue(true);
  mocks.tiktokCredentials.mockReturnValue({
    clientKey: "ck",
    clientSecret: "cs",
    environment: "sandbox",
  });
  mocks.resolveTiktokRedirectUri.mockReturnValue("https://app.example.com/tiktok/callback");
  mocks.exchangeCodeForToken.mockResolvedValue({ ok: true as const, data: { access_token: "at" } });
  mocks.creatorInfo.mockResolvedValue({
    ok: true as const,
    data: { open_id: "o1", display_name: "Ana", avatar_url: "u" },
  });
  mocks.saveTiktokAccount.mockResolvedValue(undefined);
});

describe("GET /tiktok/connect", () => {
  it("não-admin é negado (redireciona ao painel)", async () => {
    mocks.isAdminUser.mockResolvedValue(false);
    const res = await connectGET(new NextRequest("http://localhost:3100/tiktok/connect"));
    expect(res.headers.get("location")).toBe("http://localhost:3100/painel");
    expect(mocks.tiktokCredentials).not.toHaveBeenCalled();
  });

  it("credencial ausente ⇒ fail-closed (redireciona com erro)", async () => {
    mocks.tiktokCredentials.mockReturnValue(null);
    const res = await connectGET(new NextRequest("http://localhost:3100/tiktok/connect"));
    expect(res.headers.get("location")).toBe("http://localhost:3100/admin/tiktok?tiktok=erro_config");
  });

  it("admin com credencial ⇒ redireciona ao authorize e grava cookies httpOnly", async () => {
    const res = await connectGET(new NextRequest("http://localhost:3100/tiktok/connect"));
    const location = res.headers.get("location");
    expect(location).not.toBeNull();

    const url = new URL(location as string);
    expect(url.origin).toBe("https://www.tiktok.com");
    expect(url.pathname).toBe("/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("ck");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/tiktok/callback");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tiktok_oauth_state=");
    expect(setCookie).toContain("tiktok_oauth_verifier=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Max-Age=600");
  });
});

describe("GET /tiktok/callback", () => {
  it("state ausente ⇒ 400 sem troca de token", async () => {
    const res = await callbackGET(callbackReq("code=x"));
    expect(res.status).toBe(400);
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("state incorreto ⇒ 400 sem troca de token", async () => {
    const res = await callbackGET(callbackReq("code=x&state=errado", "tiktok_oauth_state=correto"));
    expect(res.status).toBe(400);
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("state expirado (cookie ausente) ⇒ 400 sem troca de token", async () => {
    const res = await callbackGET(callbackReq("code=x&state=abc"));
    expect(res.status).toBe(400);
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("não-admin é negado (mesmo com state válido)", async () => {
    mocks.isAdminUser.mockResolvedValue(false);
    const res = await callbackGET(
      callbackReq("code=x&state=abc", "tiktok_oauth_state=abc; tiktok_oauth_verifier=v"),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3100/painel");
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("erro/cancelamento do TikTok volta ao admin sem trocar token", async () => {
    const res = await callbackGET(callbackReq("error=access_denied&state=abc"));
    expect(res.headers.get("location")).toBe("http://localhost:3100/admin/tiktok?tiktok=cancelado");
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
