import { describe, expect, it } from "vitest";

import { buildPublishPlan } from "@/lib/prospecting/publish-plan";
import { createSupabasePostStore } from "@/lib/prospecting/posts-store";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";

const suppliers = [
  { handle: "buffet_a", category: "buffet" },
  { handle: "buffet_b", category: "buffet" },
  { handle: "buffet_c", category: "buffet" },
  { handle: "foto_a", category: "fotografia" },
];

function fakeFetch(route: (url: string) => unknown, status = 200): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify(route(url)), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("plano de publicação", () => {
  it("gera um post por lote com legenda e prompt", () => {
    const plan = buildPublishPlan(suppliers, { keyword: "cotação", maxTagsPerPost: 2, maxPostsPerDay: 1 });
    expect(plan).toHaveLength(3);
    expect(plan[0]?.handles).toEqual(["buffet_a", "buffet_b"]);
    expect(plan[0]?.caption).toContain("COTAÇÃO");
    expect(plan[0]?.imagePrompt.length).toBeGreaterThan(10);
  });

  it("respeita maxPostsPerDay no dayIndex", () => {
    const plan = buildPublishPlan(suppliers, { keyword: "cotação", maxTagsPerPost: 1, maxPostsPerDay: 2 });
    expect(plan[0]?.dayIndex).toBe(0);
    expect(plan[2]?.dayIndex).toBe(1);
  });
});

describe("runtime de publicação", () => {
  const planned = { dayIndex: 0, category: "buffet", handles: ["buffet_a"], imagePrompt: "salao", caption: "Comente COTAÇÃO" };
  const meta = { igUserId: "1784", accessToken: "tok" };

  it("sem aprovação não chama nenhuma API", async () => {
    let called = false;
    const outcome = await publishPlannedPost({
      planned,
      approved: false,
      modelslabKey: "k",
      meta,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ ok: false, reason: "approval_required" });
    expect(called).toBe(false);
  });

  it("gera imagem, cria container e publica", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      calls.push(url);
      if (url.includes("modelslab.com")) return { status: "success", output: ["https://cdn/img.jpg"], id: 1 };
      if (url.includes("/media?")) return { id: "container-1" };
      if (url.includes("/media_publish")) return { id: "media-1" };
      return {};
    });
    const outcome = await publishPlannedPost({ planned, approved: true, modelslabKey: "k", meta, fetchImpl });
    expect(outcome).toEqual({ ok: true, mediaId: "media-1", imageUrl: "https://cdn/img.jpg" });
    expect(calls.some((u) => u.includes("modelslab.com"))).toBe(true);
    expect(calls.some((u) => u.includes("media_publish"))).toBe(true);
  });

  it("para quando a imagem falha", async () => {
    const fetchImpl = fakeFetch(() => ({ status: "error", message: "sem crédito" }), 401);
    const outcome = await publishPlannedPost({ planned, approved: true, modelslabKey: "k", meta, fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("image_failed");
  });
});

describe("persistência do post", () => {
  const planned = { dayIndex: 0, category: "buffet", handles: ["buffet_a"], imagePrompt: "salao", caption: "Comente COTAÇÃO" };
  const meta = { igUserId: "1784", accessToken: "tok" };

  function fakeStore(): { store: { record: (i: { status: string }) => Promise<void> }; statuses: string[] } {
    const statuses: string[] = [];
    return {
      statuses,
      store: {
        async record(input) {
          statuses.push(input.status);
        },
      },
    };
  }

  it("registra pending_approval quando não aprovado", async () => {
    const { store, statuses } = fakeStore();
    await publishPlannedPost({ planned, approved: false, modelslabKey: "k", meta, store: store as never });
    expect(statuses).toEqual(["pending_approval"]);
  });

  it("registra failed quando a imagem falha", async () => {
    const { store, statuses } = fakeStore();
    const fetchImpl = fakeFetch(() => ({ status: "error", message: "x" }), 401);
    await publishPlannedPost({ planned, approved: true, modelslabKey: "k", meta, store: store as never, fetchImpl });
    expect(statuses).toEqual(["failed"]);
  });

  it("registra published ao concluir", async () => {
    const { store, statuses } = fakeStore();
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("modelslab.com")) return { status: "success", output: ["https://cdn/img.jpg"] };
      if (url.includes("/media?")) return { id: "container-1" };
      if (url.includes("/media_publish")) return { id: "media-1" };
      return {};
    });
    await publishPlannedPost({ planned, approved: true, modelslabKey: "k", meta, store: store as never, fetchImpl });
    expect(statuses).toEqual(["published"]);
  });
});


describe("createSupabasePostStore", () => {
  it("grava os campos do post na tabela prospect_posts", async () => {
    let values: Record<string, unknown> = {};
    const store = createSupabasePostStore({
      from: () => ({
        insert: (v: Record<string, unknown>) => {
          values = v;
          return Promise.resolve({ error: null });
        },
      }),
    } as never);
    await store.record({
      planned: { dayIndex: 2, category: "buffet", handles: ["a"], imagePrompt: "p", caption: "c" },
      status: "published",
      imageUrl: "https://cdn/x.jpg",
      igMediaId: "m1",
    });
    expect(values).toMatchObject({ status: "published", day_index: 2, categories: ["buffet"], ig_media_id: "m1" });
  });
});
