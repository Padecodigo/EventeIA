import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  environment: "sandbox" | "production";
  access_token: string;
  encrypted: boolean;
  expires_at: string | null;
};

let row: Row | null = null;
let queryError: { code: string } | null = null;
let upsertedRow: Record<string, unknown> | null = null;
let upsertCalled = false;

function from() {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: row, error: queryError }),
    upsert: (value: Record<string, unknown>) => {
      upsertedRow = value;
      upsertCalled = true;
      return Promise.resolve({ error: null });
    },
  };
  return q;
}

const mocks = vi.hoisted(() => ({ serverEnv: vi.fn() }));

vi.mock("@/lib/env", () => ({
  serverEnv: mocks.serverEnv,
  isConfigured: (key: string | undefined): key is string => key !== undefined && key.length > 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

import { protectToken } from "@/lib/tiktok/encryption";
import { getActiveTiktokAccessToken, saveTiktokAccount } from "@/lib/tiktok/store";

beforeEach(() => {
  row = null;
  queryError = null;
  upsertedRow = null;
  upsertCalled = false;
  mocks.serverEnv.mockReset();
  mocks.serverEnv.mockReturnValue({
    TIKTOK_ENV: "sandbox",
    TIKTOK_TOKEN_ENCRYPTION_KEY: "encryption-key",
  });
});

describe("getActiveTiktokAccessToken", () => {
  it("rejeita token em claro mesmo com chave configurada", async () => {
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: "plain-token",
      encrypted: false,
      expires_at: null,
    };

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "not_encrypted",
    });
  });

  it("rejeita token em claro quando também falta a chave", async () => {
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: "plain-token",
      encrypted: false,
      expires_at: null,
    };
    mocks.serverEnv.mockReturnValue({
      TIKTOK_ENV: "sandbox",
      TIKTOK_TOKEN_ENCRYPTION_KEY: undefined,
    });

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "not_encrypted",
    });
  });

  it("descriptografa o token com a chave configurada", async () => {
    const protectedToken = protectToken("secret-token", "encryption-key");
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: protectedToken.value,
      encrypted: true,
      expires_at: null,
    };

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: true,
      accessToken: "secret-token",
      environment: "sandbox",
      accountId: "account-1",
    });
  });

  it("falha fechado quando o token está criptografado e falta a chave", async () => {
    const protectedToken = protectToken("secret-token", "encryption-key");
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: protectedToken.value,
      encrypted: true,
      expires_at: null,
    };
    mocks.serverEnv.mockReturnValue({
      TIKTOK_ENV: "sandbox",
      TIKTOK_TOKEN_ENCRYPTION_KEY: undefined,
    });

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "missing_key",
    });
  });

  it("falha fechado com chave errada", async () => {
    const protectedToken = protectToken("secret-token", "old-key");
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: protectedToken.value,
      encrypted: true,
      expires_at: null,
    };

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "decrypt_failed",
    });
  });

  it("não usa token expirado", async () => {
    row = {
      id: "account-1",
      environment: "sandbox",
      access_token: "plain-token",
      encrypted: false,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("devolve missing_account quando não há conta ativa", async () => {
    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "missing_account",
    });
  });

  it("devolve missing_account quando a consulta falha", async () => {
    queryError = { code: "PGRST301" };

    await expect(getActiveTiktokAccessToken()).resolves.toEqual({
      ok: false,
      reason: "missing_account",
    });
  });
});

describe("saveTiktokAccount", () => {
  const input = {
    ownerProfileId: "admin-1",
    environment: "sandbox" as const,
    openId: "open-1",
    displayName: "EventeIATeste",
    avatarUrl: null,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    scopes: ["video.upload"],
    expiresAt: null,
  };

  it("falha fechado sem chave e não grava token em claro", async () => {
    mocks.serverEnv.mockReturnValue({
      TIKTOK_ENV: "sandbox",
      TIKTOK_TOKEN_ENCRYPTION_KEY: undefined,
    });

    await expect(saveTiktokAccount(input)).rejects.toThrow(/TIKTOK_TOKEN_ENCRYPTION_KEY/);
    expect(upsertCalled).toBe(false);
  });

  it("grava access/refresh criptografados quando a chave existe", async () => {
    await saveTiktokAccount(input);

    if (upsertedRow === null) throw new Error("upsert não foi chamado");
    expect(upsertedRow.encrypted).toBe(true);
    expect(upsertedRow.access_token).not.toBe("access-token");
    expect(upsertedRow.refresh_token).not.toBe("refresh-token");
  });
});
