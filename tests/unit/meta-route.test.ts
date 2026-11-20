import { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isAdminUser: vi.fn(),
  tiktokCanonicalOrigin: vi.fn(),
  metaLoginConfig: vi.fn(),
  exchangeCodeForUserToken: vi.fn(),
  exchangeForLongLivedUserToken: vi.fn(),
  fetchMe: vi.fn(),
  fetchGrantedScopes: vi.fn(),
  saveMetaUserGrant: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  isAdminUser: mocks.isAdminUser,
}));

vi.mock("@/lib/tiktok/config", () => ({
  tiktokCanonicalOrigin: mocks.tiktokCanonicalOrigin,
}));

vi.mock("@/lib/meta/login-config", () => ({
  metaLoginConfig: mocks.metaLoginConfig,
}));

vi.mock("@/lib/meta/graph-login", () => ({
  exchangeCodeForUserToken: mocks.exchangeCodeForUserToken,
  exchangeForLongLivedUserToken: mocks.exchangeForLongLivedUserToken,
  fetchMe: mocks.fetchMe,
  fetchGrantedScopes: mocks.fetchGrantedScopes,
}));

vi.mock("@/lib/meta/connection-store", () => ({
  saveMetaUserGrant: mocks.saveMetaUserGrant,
}));

import { GET as callbackGET } from "@/app/meta/callback/route";
import { GET as connectGET } from "@/app/meta/connect/route";

const ADMIN = { id: "u-admin", email: "admin@eventeia.com" };

const CONFIG = {
  appId: "app",
  appSecret: "sec",
  redirectUri: "http://localhost:3100/meta/callback",
  apiVersion: "v26.0",
  configId: null,
  encryptionKey: "k",
};

function callbackReq(query: string, cookie = ""): NextRequest {
  return new NextRequest(`http://localhost:3100/meta/callback?${query}`, {
    headers: cookie.length > 0 ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(ADMIN);
  mocks.isAdminUser.mockResolvedValue(true);
  mocks.tiktokCanonicalOrigin.mockReturnValue("http://localhost:3100");
  mocks.metaLoginConfig.mockReturnValue(CONFIG);
  mocks.exchangeCodeForUserToken.mockResolvedValue({
    ok: true as const,
    data: { accessToken: "short", expiresIn: 3600 },
  });
  mocks.exchangeForLongLivedUserToken.mockResolvedValue({
    ok: true as const,
    data: { accessToken: "long", expiresIn: 5184000 },
  });
  mocks.fetchMe.mockResolvedValue({
    ok: true as const,
    data: { id: "fb1", name: "Fulano" },
  });
  mocks.fetchGrantedScopes.mockResolvedValue({
    ok: true as const,
    data: ["pages_show_list"],
  });
  mocks.saveMetaUserGrant.mockResolvedValue(undefined);
});

describe("GET /meta/connect", () => {
  it("admin com configuração ⇒ redireciona ao authorize e define cookie de state", async () => {
    const res = await connectGET(new NextRequest("http://localhost:3100/meta/connect"));
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect((location as string).startsWith("https://www.facebook.com/v26.0/dialog/oauth")).toBe(
      true,
    );

    const state = res.cookies.get("meta_oauth_state")?.value;
    expect(state).toBeDefined();
    expect((state as string).length).toBeGreaterThan(0);
  });

  it("configuração nula ⇒ redireciona ao admin com erro de config", async () => {
    mocks.metaLoginConfig.mockReturnValue(null);
    const res = await connectGET(new NextRequest("http://localhost:3100/meta/connect"));
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect((location as string).endsWith("/admin/meta?meta=erro_config")).toBe(true);
  });

  it("não-admin ⇒ redireciona ao painel", async () => {
    mocks.isAdminUser.mockResolvedValue(false);
    const res = await connectGET(new NextRequest("http://localhost:3100/meta/connect"));
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect((location as string).endsWith("/painel")).toBe(true);
  });
});

describe("GET /meta/callback", () => {
  it("state incorreto ⇒ 400 e não troca o code", async () => {
    const res = await callbackGET(
      callbackReq("state=errado&code=c", "meta_oauth_state=certo"),
    );
    expect(res.status).toBe(400);
    expect(mocks.exchangeCodeForUserToken).not.toHaveBeenCalled();
  });

  it("error=access_denied ⇒ redireciona com meta=cancelado", async () => {
    const res = await callbackGET(callbackReq("error=access_denied"));
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location as string).toContain("meta=cancelado");
  });

  it("sucesso ⇒ grava a concessão e redireciona com meta=conectado", async () => {
    const res = await callbackGET(
      callbackReq("state=st&code=c", "meta_oauth_state=st"),
    );

    expect(mocks.saveMetaUserGrant).toHaveBeenCalledTimes(1);
    const arg = mocks.saveMetaUserGrant.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.fbUserId).toBe("fb1");
    expect(arg.userToken).toBe("long");
    expect(arg.scopes).toEqual(["pages_show_list"]);
    expect(arg.connectedBy).toBe(ADMIN.id);

    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location as string).toContain("meta=conectado");
  });

  it("falha ao gravar ⇒ redireciona com meta=erro_gravar", async () => {
    mocks.saveMetaUserGrant.mockRejectedValue(new Error("boom"));
    const res = await callbackGET(
      callbackReq("state=st&code=c", "meta_oauth_state=st"),
    );
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location as string).toContain("meta=erro_gravar");
  });
});
