import { beforeEach, describe, expect, it, vi } from "vitest";

let upsertedRow: Record<string, unknown> | null = null;
let upsertCalled = false;

function from() {
  const q = {
    select: () => q,
    eq: () => q,
    update: () => q,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    delete: () => q,
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
  isConfigured: (v: string | undefined): v is string => v !== undefined && v.length > 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

import { decryptToken, deriveKey } from "@/lib/tiktok/encryption";
import { pickPageCredentials, saveMetaUserGrant } from "@/lib/meta/connection-store";

beforeEach(() => {
  vi.clearAllMocks();
  upsertedRow = null;
  upsertCalled = false;
  mocks.serverEnv.mockReturnValue({ META_TOKEN_ENCRYPTION_KEY: "chave-de-teste" });
});

describe("pickPageCredentials", () => {
  it("prefere o armazenado (source 'conexao') quando Página e token existem", () => {
    const creds = pickPageCredentials(
      { pageId: "p1", pageAccessToken: "tok", igUserId: "ig1" },
      { META_PAGE_ID: "env-p", META_PAGE_ACCESS_TOKEN: "env-tok" },
    );
    expect(creds).not.toBeNull();
    expect(creds?.pageId).toBe("p1");
    expect(creds?.pageAccessToken).toBe("tok");
    expect(creds?.igUserId).toBe("ig1");
    expect(creds?.source).toBe("conexao");
  });

  it("usa o ambiente (source 'ambiente') quando o token armazenado é null", () => {
    const creds = pickPageCredentials(
      { pageId: "p1", pageAccessToken: null, igUserId: null },
      { META_PAGE_ID: "env-p", META_PAGE_ACCESS_TOKEN: "env-tok", META_INSTAGRAM_BUSINESS_ID: "ig-env" },
    );
    expect(creds).not.toBeNull();
    expect(creds?.pageId).toBe("env-p");
    expect(creds?.pageAccessToken).toBe("env-tok");
    expect(creds?.igUserId).toBe("ig-env");
    expect(creds?.source).toBe("ambiente");
  });

  it("retorna null quando não há nada disponível", () => {
    expect(pickPageCredentials(null, {})).toBeNull();
    expect(
      pickPageCredentials(
        { pageId: null, pageAccessToken: null, igUserId: null },
        { META_PAGE_ID: undefined, META_PAGE_ACCESS_TOKEN: undefined },
      ),
    ).toBeNull();
  });

  it("retorna null quando as strings são vazias/em branco", () => {
    expect(
      pickPageCredentials(
        { pageId: "   ", pageAccessToken: "  ", igUserId: null },
        { META_PAGE_ID: "   ", META_PAGE_ACCESS_TOKEN: "" },
      ),
    ).toBeNull();
  });
});

describe("saveMetaUserGrant", () => {
  it("lança erro quando META_TOKEN_ENCRYPTION_KEY está ausente e não chama upsert", async () => {
    mocks.serverEnv.mockReturnValue({ META_TOKEN_ENCRYPTION_KEY: undefined });

    await expect(
      saveMetaUserGrant({
        connectedBy: "u-admin",
        fbUserId: "fb1",
        fbUserName: "Fulano",
        userToken: "segredo",
        userTokenExpiresAt: null,
        scopes: ["pages_show_list"],
      }),
    ).rejects.toThrow(/META_TOKEN_ENCRYPTION_KEY/);

    expect(upsertCalled).toBe(false);
    expect(upsertedRow).toBeNull();
  });

  it("grava token cifrado e descriptografa de volta com a chave derivada", async () => {
    const key = "chave-de-teste";
    await saveMetaUserGrant({
      connectedBy: "u-admin",
      fbUserId: "fb1",
      fbUserName: "Fulano",
      userToken: "token-em-claro",
      userTokenExpiresAt: null,
      scopes: ["pages_show_list"],
    });

    expect(upsertCalled).toBe(true);
    expect(upsertedRow).not.toBeNull();

    const stored = upsertedRow as Record<string, unknown>;
    expect(stored.user_access_token).not.toBe("token-em-claro");
    expect(typeof stored.user_access_token).toBe("string");

    const decrypted = decryptToken(stored.user_access_token as string, deriveKey(key)!);
    expect(decrypted).toBe("token-em-claro");

    expect(stored.page_id).toBeNull();
    expect(stored.slot).toBe("primary");
    expect(stored.encrypted).toBe(true);
  });
});
