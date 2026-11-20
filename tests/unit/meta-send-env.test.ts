import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverEnv: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: mocks.serverEnv,
}));

vi.mock("@/lib/meta/connection-store", () => ({
  resolveMetaPageCredentials: mocks.resolve,
}));

import { resolveMetaSendEnv } from "@/lib/meta/send-env";

const baseEnv = {
  META_PAGE_ID: "env-page",
  META_PAGE_ACCESS_TOKEN: "env-tok",
  META_INSTAGRAM_BUSINESS_ID: "env-ig",
  META_API_VERSION: "v26.0",
};

describe("resolveMetaSendEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.mockReturnValue({ ...baseEnv });
  });

  it("usa as credenciais da conexão para página, token e ig quando source é 'conexao'", async () => {
    mocks.resolve.mockResolvedValue({
      source: "conexao",
      pageId: "conn-page",
      pageAccessToken: "conn-tok",
      igUserId: "conn-ig",
    });

    const result = await resolveMetaSendEnv();

    expect(result).toEqual({
      META_PAGE_ID: "conn-page",
      META_PAGE_ACCESS_TOKEN: "conn-tok",
      META_INSTAGRAM_BUSINESS_ID: "conn-ig",
      META_API_VERSION: "v26.0",
    });
  });

  it("mantém o ig do ambiente quando igUserId é null na conexão", async () => {
    mocks.resolve.mockResolvedValue({
      source: "conexao",
      pageId: "conn-page",
      pageAccessToken: "conn-tok",
      igUserId: null,
    });

    const result = await resolveMetaSendEnv();

    expect(result).toEqual({
      META_PAGE_ID: "conn-page",
      META_PAGE_ACCESS_TOKEN: "conn-tok",
      META_INSTAGRAM_BUSINESS_ID: "env-ig",
      META_API_VERSION: "v26.0",
    });
  });

  it("retorna o ambiente sem alterações quando source é 'ambiente'", async () => {
    mocks.resolve.mockResolvedValue({
      source: "ambiente",
      pageId: "x",
      pageAccessToken: "y",
      igUserId: null,
    });

    const result = await resolveMetaSendEnv();

    expect(result).toEqual(baseEnv);
  });

  it("retorna o ambiente quando a resolução é null", async () => {
    mocks.resolve.mockResolvedValue(null);

    const result = await resolveMetaSendEnv();

    expect(result).toEqual(baseEnv);
  });

  it("retorna o ambiente quando a resolução rejeita", async () => {
    mocks.resolve.mockRejectedValue(new Error("falhou"));

    const result = await resolveMetaSendEnv();

    expect(result).toEqual(baseEnv);
  });
});
