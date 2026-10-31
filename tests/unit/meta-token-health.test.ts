import { describe, expect, it, vi } from "vitest";

import { checkMetaToken, OPTIONAL_META_SCOPES, parseDebugToken, REQUIRED_META_SCOPES } from "@/lib/meta/token-health";

const ALL_SCOPES = [...REQUIRED_META_SCOPES, ...OPTIONAL_META_SCOPES];

describe("parseDebugToken", () => {
  it("token válido que nunca expira (expires_at == 0)", () => {
    const health = parseDebugToken({
      data: {
        app_id: "123",
        type: "USER",
        data_access_expires_at: 1760000000,
        expires_at: 0,
        is_valid: true,
        scopes: ALL_SCOPES,
      },
    });
    expect(health.isValid).toBe(true);
    expect(health.expiresAt).toBeNull();
    expect(health.dataAccessExpiresAt).toBe(new Date(1760000000 * 1000).toISOString());
    expect(health.missingScopes).toEqual([]);
    expect(health.optionalMissing).toEqual([]);
    expect(health.type).toBe("USER");
    expect(health.appId).toBe("123");
  });

  it("converte expires_at em ISO", () => {
    const health = parseDebugToken({ data: { is_valid: true, expires_at: 1760000000, scopes: ALL_SCOPES } });
    expect(health.expiresAt).toBe(new Date(1760000000 * 1000).toISOString());
  });

  it("token inválido (is_valid false)", () => {
    const health = parseDebugToken({ data: { is_valid: false, expires_at: 0, scopes: ALL_SCOPES } });
    expect(health.isValid).toBe(false);
  });

  it("calcula escopos obrigatórios faltando", () => {
    const granted = ["instagram_basic", "instagram_content_publish"];
    const health = parseDebugToken({ data: { is_valid: true, expires_at: 0, scopes: granted } });
    expect(health.isValid).toBe(true);
    expect(health.missingScopes).toEqual(REQUIRED_META_SCOPES.filter((s) => !granted.includes(s)));
    expect(health.optionalMissing).toEqual([...OPTIONAL_META_SCOPES]);
  });

  it("erro da Graph API (error no topo)", () => {
    const health = parseDebugToken({ error: { message: "invalid token", code: 190 } });
    expect(health.isValid).toBe(false);
    expect(health.error).toBe("invalid token");
    expect(health.missingScopes).toEqual([...REQUIRED_META_SCOPES]);
  });

  it("resposta sem data", () => {
    const health = parseDebugToken({ foo: 1 });
    expect(health.isValid).toBe(false);
    expect(health.error).toBe("resposta sem data");
  });
});

describe("checkMetaToken", () => {
  it("chama GET no host graph.facebook.com e devolve saúde; token nunca logado", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ data: { is_valid: true, expires_at: 0, scopes: ALL_SCOPES } }), { status: 200 });
    }) as unknown as typeof fetch;

    const health = await checkMetaToken({ accessToken: "SECRET_TOKEN", apiVersion: "v26.0", fetchImpl });

    expect(health.isValid).toBe(true);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.host).toBe("graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/debug_token");
    expect(url.searchParams.get("input_token")).toBe("SECRET_TOKEN");
    expect(url.searchParams.get("access_token")).toBe("SECRET_TOKEN");
    // Regra de segurança: o token nunca aparece em log.
    for (const a of [...log.mock.calls, ...warn.mock.calls]) {
      expect(a.join(" ")).not.toContain("SECRET_TOKEN");
    }
    log.mockRestore();
    warn.mockRestore();
  });

  it("propaga erro da Graph API (HTTP não-ok com corpo error)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "invalid OAuth access token" } }), { status: 400 })) as unknown as typeof fetch;
    const health = await checkMetaToken({ accessToken: "tok", fetchImpl });
    expect(health.isValid).toBe(false);
    expect(health.error).toBe("invalid OAuth access token");
  });

  it("rede indisponível vira erro sem derrubar", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const health = await checkMetaToken({ accessToken: "tok", fetchImpl });
    expect(health.isValid).toBe(false);
    expect(health.error).toMatch(/falha ao consultar debug_token/);
  });
});
