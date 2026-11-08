import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resolução das credenciais e do redirect URI do TikTok. A env é mockada para
 * exercitar os branches sem depender de .env; a origem canônica lê process.env.
 */

const mocks = vi.hoisted(() => ({ serverEnv: vi.fn() }));

vi.mock("@/lib/env", () => ({
  serverEnv: mocks.serverEnv,
  isConfigured: (key: string | undefined): key is string => key !== undefined && key.length > 0,
}));

import type { ServerEnv } from "@/lib/env";
import {
  resolveTiktokRedirectUri,
  tiktokCanonicalOrigin,
  tiktokCredentials,
} from "@/lib/tiktok/config";
import { buildAuthorizeUrl, TIKTOK_SCOPE } from "@/lib/tiktok/oauth";

const CANONICAL = "https://app.eventeia.com.br";
const BIND = "http://0.0.0.0:3000/tiktok/connect";
const originalCanonical = process.env.NEXT_PUBLIC_APP_URL;

function setEnv(values: Partial<ServerEnv>): void {
  mocks.serverEnv.mockReturnValue(values);
}

const h = (values: Record<string, string> = {}): Headers => new Headers(values);

beforeEach(() => {
  mocks.serverEnv.mockReset();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  if (originalCanonical === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalCanonical;
});

describe("tiktokCredentials", () => {
  it("sandbox usa TIKTOK_SANDBOX_* e ignora as chaves de produção", () => {
    setEnv({
      TIKTOK_ENV: "sandbox",
      TIKTOK_CLIENT_KEY: "prod-key",
      TIKTOK_CLIENT_SECRET: "prod-secret",
      TIKTOK_SANDBOX_CLIENT_KEY: "sandbox-key",
      TIKTOK_SANDBOX_CLIENT_SECRET: "sandbox-secret",
    });

    expect(tiktokCredentials()).toEqual({
      clientKey: "sandbox-key",
      clientSecret: "sandbox-secret",
      environment: "sandbox",
    });
  });

  it("production usa TIKTOK_CLIENT_* e ignora as chaves de sandbox", () => {
    setEnv({
      TIKTOK_ENV: "production",
      TIKTOK_CLIENT_KEY: "prod-key",
      TIKTOK_CLIENT_SECRET: "prod-secret",
      TIKTOK_SANDBOX_CLIENT_KEY: "sandbox-key",
      TIKTOK_SANDBOX_CLIENT_SECRET: "sandbox-secret",
    });

    expect(tiktokCredentials()).toEqual({
      clientKey: "prod-key",
      clientSecret: "prod-secret",
      environment: "production",
    });
  });

  it("fail-closed quando falta a credencial do ambiente ativo", () => {
    setEnv({
      TIKTOK_ENV: "sandbox",
      TIKTOK_CLIENT_KEY: "prod-key",
      TIKTOK_CLIENT_SECRET: "prod-secret",
      TIKTOK_SANDBOX_CLIENT_KEY: "sandbox-key",
    });

    expect(tiktokCredentials()).toBeNull();
  });
});

describe("tiktokCanonicalOrigin", () => {
  it("usa somente NEXT_PUBLIC_APP_URL e normaliza para a origem", () => {
    process.env.NEXT_PUBLIC_APP_URL = `${CANONICAL}/algum/caminho`;

    expect(tiktokCanonicalOrigin()).toBe(CANONICAL);
  });

  it("aceita loopback em desenvolvimento", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(tiktokCanonicalOrigin()).toBe("http://localhost:3000");
  });

  it.each([
    "",
    "not a url",
    "javascript:alert(1)",
    "ftp://app.eventeia.com.br",
    "http://0.0.0.0:3000",
    "http://[::]:3000",
    "https://user:pass@app.eventeia.com.br",
    "https://app.eventeia.com.br/#fragmento",
    "https://app.eventeia.com.br/?x=1",
  ])("falha fechado para origem canônica inválida (%s)", (value) => {
    process.env.NEXT_PUBLIC_APP_URL = value;

    expect(tiktokCanonicalOrigin()).toBeNull();
  });

  it("falha fechado sem NEXT_PUBLIC_APP_URL, mesmo com forwarded host", () => {
    expect(tiktokCanonicalOrigin()).toBeNull();
  });
});

describe("resolveTiktokRedirectUri", () => {
  it("usa o TIKTOK_REDIRECT_URI exato quando está no mesmo origin canônico", () => {
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL;
    setEnv({ TIKTOK_REDIRECT_URI: `${CANONICAL}/tiktok/callback` });

    expect(resolveTiktokRedirectUri(h(), BIND)).toBe(`${CANONICAL}/tiktok/callback`);
  });

  it("deriva da origem canônica quando não há override", () => {
    process.env.NEXT_PUBLIC_APP_URL = `${CANONICAL}/`;
    setEnv({ TIKTOK_REDIRECT_URI: "" });

    expect(resolveTiktokRedirectUri(h(), BIND)).toBe(`${CANONICAL}/tiktok/callback`);
  });

  it.each([
    "https://evil.com/tiktok/callback",
    "https://app.eventeia.com.br.evil.com/tiktok/callback",
    "http://0.0.0.0:3000/tiktok/callback",
    "http://app.eventeia.com.br/tiktok/callback",
    "javascript:alert(1)",
    "not a url",
  ])("ignora override inseguro/malformado (%s)", (override) => {
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL;
    setEnv({ TIKTOK_REDIRECT_URI: override });

    expect(resolveTiktokRedirectUri(h(), BIND)).toBe(`${CANONICAL}/tiktok/callback`);
  });

  it("ignora forwarded host atacante e mantém a origem canônica", () => {
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL;
    setEnv({ TIKTOK_REDIRECT_URI: "" });
    const headers = h({
      "x-forwarded-host": "evil.com",
      "x-forwarded-proto": "https",
    });

    expect(resolveTiktokRedirectUri(headers, BIND)).toBe(`${CANONICAL}/tiktok/callback`);
  });

  it("falha fechado sem origem canônica, mesmo com override e forwarded válidos", () => {
    setEnv({ TIKTOK_REDIRECT_URI: `${CANONICAL}/tiktok/callback` });
    const headers = h({
      "x-forwarded-host": "evil.com",
      "x-forwarded-proto": "https",
    });

    expect(resolveTiktokRedirectUri(headers, BIND)).toBeNull();
  });

  it("falha fechado quando a origem canônica é um bind host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://0.0.0.0:3000";
    setEnv({ TIKTOK_REDIRECT_URI: "http://0.0.0.0:3000/tiktok/callback" });

    expect(resolveTiktokRedirectUri(h(), BIND)).toBeNull();
  });

  it("monta o authorize de sucesso com redirect URI canônico", () => {
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL;
    setEnv({ TIKTOK_REDIRECT_URI: "https://evil.com/tiktok/callback" });

    const redirectUri = resolveTiktokRedirectUri();
    if (redirectUri === null) throw new Error("redirect URI canônico ausente");

    const authorize = new URL(
      buildAuthorizeUrl({
        clientKey: "client-key",
        redirectUri,
        scope: TIKTOK_SCOPE,
        state: "state",
        codeChallenge: "challenge",
      }),
    );

    expect(authorize.origin).toBe("https://www.tiktok.com");
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${CANONICAL}/tiktok/callback`);
  });
});
