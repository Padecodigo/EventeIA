import { describe, expect, it, vi } from "vitest";

import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchGrantedScopes,
  fetchMe,
  listManagedPages,
} from "@/lib/meta/graph-login";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("exchangeCodeForUserToken", () => {
  it("chama o endpoint de token com o code e retorna accessToken e expiresIn", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ access_token: "tok-1", expires_in: 3600 }));

    const result = await exchangeCodeForUserToken({
      code: "abc",
      appId: "app-1",
      appSecret: "s3cr3t",
      redirectUri: "https://example.com/meta/callback",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, data: { accessToken: "tok-1", expiresIn: 3600 } });

    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/v26.0/oauth/access_token");
    expect(calledUrl).toContain("code=abc");
  });

  it("propaga mensagem de erro da Graph API sem vazar o segredo", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { message: "Invalid code" } }, 400));

    const result = await exchangeCodeForUserToken({
      code: "abc",
      appId: "app-1",
      appSecret: "s3cr3t",
      redirectUri: "https://example.com/meta/callback",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Invalid code");
    expect(result.status).toBe(400);
    expect(result.error).not.toContain("s3cr3t");
  });

  it("retorna status null quando a requisição falha na rede", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    const result = await exchangeCodeForUserToken({
      code: "abc",
      appId: "app-1",
      appSecret: "s3cr3t",
      redirectUri: "https://example.com/meta/callback",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBeNull();
  });
});

describe("exchangeForLongLivedUserToken", () => {
  it("inclui grant_type=fb_exchange_token na URL", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ access_token: "long-tok", expires_in: 5184000 }));

    const result = await exchangeForLongLivedUserToken({
      userToken: "short-tok",
      appId: "app-1",
      appSecret: "s3cr3t",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      data: { accessToken: "long-tok", expiresIn: 5184000 },
    });

    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("grant_type=fb_exchange_token");
  });
});

describe("fetchMe", () => {
  it("retorna id e name do usuário", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "user-1", name: "Ada" }));

    const result = await fetchMe({ userToken: "tok-1", apiVersion: "v26.0", fetchImpl });

    expect(result).toEqual({ ok: true, data: { id: "user-1", name: "Ada" } });
  });
});

describe("fetchGrantedScopes", () => {
  it("filtra apenas os escopos concedidos", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { permission: "pages_show_list", status: "granted" },
          { permission: "pages_messaging", status: "declined" },
        ],
      }),
    );

    const result = await fetchGrantedScopes({
      userToken: "tok-1",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, data: ["pages_show_list"] });
  });
});

describe("listManagedPages", () => {
  it("mapeia páginas gerenciadas com picture e conta do Instagram", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "page-1",
            name: "Página Um",
            access_token: "page-tok-1",
            picture: { data: { url: "https://cdn.example.com/p1.png" } },
            instagram_business_account: { id: "ig-1", username: "perfil_um" },
          },
        ],
      }),
    );

    const result = await listManagedPages({
      userToken: "tok-1",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "page-1",
          name: "Página Um",
          pictureUrl: "https://cdn.example.com/p1.png",
          accessToken: "page-tok-1",
          igUserId: "ig-1",
          igUsername: "perfil_um",
        },
      ],
    });
  });

  it("descarta entradas sem access_token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "page-1", name: "Sem Token" },
          { id: "page-2", name: "Com Token", access_token: "page-tok-2" },
        ],
      }),
    );

    const result = await listManagedPages({
      userToken: "tok-1",
      apiVersion: "v26.0",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("page-2");
  });

  it("solicita fields incluindo instagram_business_account", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));

    await listManagedPages({ userToken: "tok-1", apiVersion: "v26.0", fetchImpl });

    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("instagram_business_account");
  });
});
