import { describe, expect, it, vi } from "vitest";

const serverEnv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ serverEnv }));

const { activeImageApiKey } = await import("@/lib/prospecting/image-key");

describe("activeImageApiKey (prospecção)", () => {
  it("usa NVIDIA_NIM_API_KEY quando o provedor ativo é nvidia", () => {
    serverEnv.mockReturnValue({
      IMAGE_PROVIDER: "nvidia",
      NVIDIA_NIM_API_KEY: "nv-key",
      MODELSLAB_API_KEY: "ml-key",
    });

    expect(activeImageApiKey()).toBe("nv-key");
  });

  it("usa MODELSLAB_API_KEY quando o provedor ativo é modelslab", () => {
    serverEnv.mockReturnValue({
      IMAGE_PROVIDER: "modelslab",
      NVIDIA_NIM_API_KEY: "nv-key",
      MODELSLAB_API_KEY: "ml-key",
    });

    expect(activeImageApiKey()).toBe("ml-key");
  });

  it("devolve undefined quando o provedor ativo não tem chave", () => {
    serverEnv.mockReturnValue({
      IMAGE_PROVIDER: "nvidia",
      NVIDIA_NIM_API_KEY: undefined,
      MODELSLAB_API_KEY: "ml-key",
    });

    expect(activeImageApiKey()).toBeUndefined();
  });
});
