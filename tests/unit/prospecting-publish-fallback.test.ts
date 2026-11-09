import { describe, expect, it, vi } from "vitest";

import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";

vi.mock("@/lib/marketing/card-overlay", () => ({
  composeAd: vi.fn((bytes: Buffer) => Promise.resolve(bytes)),
}));
vi.mock("@/lib/prospecting/art-cache", () => ({
  storeArtBytes: vi.fn(() =>
    Promise.resolve({
      url: "https://storage/fresh.jpg",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    }),
  ),
}));

function fakeFetch(route: (url: string) => unknown, status = 200): typeof fetch {
  return ((url: string) =>
    new Response(JSON.stringify(route(url)), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const planned = {
  dayIndex: 0,
  category: "buffet",
  handles: ["buffet_a"],
  imagePrompt: "salao",
  caption: "Comente COTAÇÃO",
};
const meta = { igUserId: "1784", accessToken: "tok" };
const staticUrl = "https://site/brand/posts/buffet.jpg";

describe("publicação sem reaproveitar foto", () => {
  it("sem chave de geração não publica a arte estática", async () => {
    let chamouModelsLab = false;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("modelslab.com")) chamouModelsLab = true;
      return {};
    });

    const outcome = await publishPlannedPost({
      planned,
      approved: true,
      meta,
      fallbackArt: { url: staticUrl },
      fetchImpl,
    });

    expect(chamouModelsLab).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("image_failed");
    expect(outcome).not.toMatchObject({ imageUrl: staticUrl });
  });

  it("geração falhando não cai para a arte da marca", async () => {
    let tentativas = 0;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("modelslab.com")) {
        tentativas += 1;
        return { status: "error", message: "sem crédito" };
      }
      return {};
    });

    const outcome = await publishPlannedPost({
      planned,
      approved: true,
      modelslabKey: "k",
      meta,
      fallbackArt: { url: staticUrl },
      fetchImpl,
    });

    expect(tentativas).toBe(3);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("image_failed");
    expect(outcome).not.toMatchObject({ imageUrl: staticUrl });
  });
});
