import { describe, expect, it } from "vitest";

import {
  META_LOGIN_SCOPES,
  buildMetaAuthorizeUrl,
  metaOauthCookieOptions,
  parseGrantedScopes,
} from "@/lib/meta/oauth";

describe("buildMetaAuthorizeUrl", () => {
  it("monta a URL base do diálogo OAuth v26.0 com os parâmetros obrigatórios", () => {
    const url = new URL(
      buildMetaAuthorizeUrl({
        appId: "app-1",
        redirectUri: "https://example.com/meta/callback",
        state: "st-1",
        apiVersion: "v26.0",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("app-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/meta/callback");
    expect(url.searchParams.get("state")).toBe("st-1");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("usa o scope com META_LOGIN_SCOPES unidos por vírgula quando não há configId", () => {
    const url = new URL(
      buildMetaAuthorizeUrl({
        appId: "app-1",
        redirectUri: "https://example.com/meta/callback",
        state: "st-1",
        apiVersion: "v26.0",
      }),
    );

    expect(url.searchParams.get("scope")).toBe(META_LOGIN_SCOPES.join(","));
    expect(url.searchParams.has("config_id")).toBe(false);
  });

  it("define config_id e omite scope quando configId é informado", () => {
    const url = new URL(
      buildMetaAuthorizeUrl({
        appId: "app-1",
        redirectUri: "https://example.com/meta/callback",
        state: "st-1",
        apiVersion: "v26.0",
        configId: "cfg-1",
      }),
    );

    expect(url.searchParams.get("config_id")).toBe("cfg-1");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("trata configId em branco como ausente e volta para scope", () => {
    const url = new URL(
      buildMetaAuthorizeUrl({
        appId: "app-1",
        redirectUri: "https://example.com/meta/callback",
        state: "st-1",
        apiVersion: "v26.0",
        configId: "  ",
      }),
    );

    expect(url.searchParams.has("config_id")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(META_LOGIN_SCOPES.join(","));
  });
});

describe("META_LOGIN_SCOPES", () => {
  it("não contém business_management", () => {
    expect(META_LOGIN_SCOPES as readonly string[]).not.toContain("business_management");
  });

  it("contém os escopos essenciais de páginas e Instagram", () => {
    expect(META_LOGIN_SCOPES as readonly string[]).toContain("pages_show_list");
    expect(META_LOGIN_SCOPES as readonly string[]).toContain("pages_manage_metadata");
    expect(META_LOGIN_SCOPES as readonly string[]).toContain("instagram_manage_comments");
  });
});

describe("parseGrantedScopes", () => {
  it("retorna apenas as permissões concedidas", () => {
    const result = parseGrantedScopes({
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_messaging", status: "declined" },
        { permission: "instagram_basic", status: "granted" },
      ],
    });

    expect(result).toEqual(["pages_show_list", "instagram_basic"]);
  });

  it("retorna [] para null", () => {
    expect(parseGrantedScopes(null)).toEqual([]);
  });

  it("retorna [] para objeto sem data", () => {
    expect(parseGrantedScopes({})).toEqual([]);
  });

  it("retorna [] quando data não é array", () => {
    expect(parseGrantedScopes({ data: "x" })).toEqual([]);
  });
});

describe("metaOauthCookieOptions", () => {
  it("usa as opções restritas esperadas para o cookie de state", () => {
    const options = metaOauthCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/meta");
    expect(options.maxAge).toBe(600);
    expect(options.sameSite).toBe("lax");
  });
});
