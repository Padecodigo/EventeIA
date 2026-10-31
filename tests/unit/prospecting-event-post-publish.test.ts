import { describe, expect, it } from "vitest";

import { publishEventPost } from "@/lib/prospecting/publish-event-post";
import type {
  ProspectingPostStatusPatch,
  ProspectingPostStore,
} from "@/lib/prospecting/event-post-store";

function fakeStore() {
  const patches: { id: string; patch: ProspectingPostStatusPatch }[] = [];
  const store = {
    async updateStatus(id: string, patch: ProspectingPostStatusPatch) {
      patches.push({ id, patch });
    },
  } as Pick<ProspectingPostStore, "updateStatus">;
  return { store, patches };
}

function fakeFetch(route: (url: string) => unknown, status = 200): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify(route(url)), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const meta = { igUserId: "1784", accessToken: "tok" };
const post = { id: "post-1", caption: "Estamos buscando fornecedores", imageUrl: "https://cdn/arte.jpg" };

describe("publicação do post de prospecção", () => {
  it("sem aprovação não chama a API e mantém pending_approval", async () => {
    const { store, patches } = fakeStore();
    let called = false;
    const outcome = await publishEventPost({
      post,
      approved: false,
      meta,
      store,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ ok: false, reason: "approval_required" });
    expect(called).toBe(false);
    expect(patches).toEqual([{ id: "post-1", patch: { status: "pending_approval" } }]);
  });

  it("cria o container e publica via lib/meta/publishing", async () => {
    const { store, patches } = fakeStore();
    const calls: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      calls.push(url);
      if (url.includes("/media?")) return { id: "container-1" };
      if (url.includes("/media_publish")) return { id: "media-1" };
      return {};
    });
    const outcome = await publishEventPost({ post, approved: true, meta, store, fetchImpl });

    expect(outcome).toEqual({ ok: true, mediaId: "media-1", imageUrl: "https://cdn/arte.jpg" });
    expect(calls.some((url) => url.includes("/media?"))).toBe(true);
    expect(calls.some((url) => url.includes("/media_publish"))).toBe(true);
    expect(patches.at(-1)?.patch).toMatchObject({ status: "published", igMediaId: "media-1" });
  });

  it("sem imagem marca failed sem chamar a API", async () => {
    const { store, patches } = fakeStore();
    const outcome = await publishEventPost({
      post: { ...post, imageUrl: null },
      approved: true,
      meta,
      store,
      fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("missing_image");
    expect(patches.at(-1)?.patch).toMatchObject({ status: "failed" });
  });

  it("falha do container registra failed com o erro", async () => {
    const { store, patches } = fakeStore();
    const fetchImpl = fakeFetch(() => ({ error: { message: "legenda inválida" } }), 400);
    const outcome = await publishEventPost({ post, approved: true, meta, store, fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("container_failed");
    expect(patches.at(-1)?.patch).toMatchObject({ status: "failed", error: "legenda inválida" });
  });
});
