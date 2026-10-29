import { describe, expect, it } from "vitest";

import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";

function fakeFetch(route: (url: string) => unknown, status = 200): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify(route(url)), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const planned = { dayIndex: 0, category: "buffet", handles: ["buffet_a"], imagePrompt: "salao", caption: "Comente COTAÇÃO" };
const meta = { igUserId: "1784", accessToken: "tok" };

describe("publicação com fallback de arte da marca", () => {
  it("sem chave de geração usa a arte da marca sem chamar o gerador", async () => {
    let chamouModelsLab = false;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("modelslab.com")) chamouModelsLab = true;
      if (url.includes("/media?")) return { id: "container-1" };
      if (url.includes("/media_publish")) return { id: "media-1" };
      return {};
    });

    const outcome = await publishPlannedPost({
      planned,
      approved: true,
      meta,
      fallbackArt: { url: "https://site/brand/posts/buffet.jpg" },
      fetchImpl,
    });

    expect(chamouModelsLab).toBe(false);
    expect(outcome).toEqual({ ok: true, mediaId: "media-1", imageUrl: "https://site/brand/posts/buffet.jpg" });
  });

  it("geração falhando cai para a arte da marca", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("modelslab.com")) return { status: "error", message: "sem crédito" };
      if (url.includes("/media?")) return { id: "container-1" };
      if (url.includes("/media_publish")) return { id: "media-1" };
      return {};
    });

    const outcome = await publishPlannedPost({
      planned,
      approved: true,
      modelslabKey: "k",
      meta,
      fallbackArt: { url: "https://site/brand/posts/buffet.jpg" },
      fetchImpl,
    });

    expect(outcome).toEqual({ ok: true, mediaId: "media-1", imageUrl: "https://site/brand/posts/buffet.jpg" });
  });
});
