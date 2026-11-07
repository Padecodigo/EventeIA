import { describe, expect, it } from "vitest";

import {
  deleteFacebookPost,
  deleteMedia,
  publishFacebookPagePost,
  publishToChannels,
} from "@/lib/meta/publishing";

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown };

function fakeFetch(route: Route) {
  const calls: { url: string; method: string; auth: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
    });
    const result = route(url, init);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const meta = {
  igUserId: "ig-1",
  accessToken: "user-token",
  pageId: "page-1",
  pageAccessToken: "page-token",
};

describe("publicação dual Facebook Page + Instagram", () => {
  it("publica nos dois canais e devolve os dois ids", async () => {
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "ig-media-1" } };
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      fetchImpl,
    });

    expect(result.kind).toBe("published");
    expect(result.instagram).toMatchObject({ kind: "published", id: "ig-media-1", skipped: false });
    expect(result.facebook).toMatchObject({ kind: "published", id: "page-1_fb-1", skipped: false });
    expect(calls.some((c) => c.url.includes("/page-1/photos?"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/media_publish"))).toBe(true);
  });

  it("um canal falhando NÃO é sucesso e preserva o id do outro", async () => {
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "ig-media-1" } };
      if (url.includes("/photos?"))
        return { status: 500, body: { error: { message: "page boom" } } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      fetchImpl,
    });

    expect(result.kind).toBe("uncertain");
    expect(result.instagram).toMatchObject({ kind: "published", id: "ig-media-1" });
    expect(result.facebook.kind).toBe("uncertain");
  });

  it("persiste cada canal imediatamente e não republica id já salvo", async () => {
    const saved: string[] = [];
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      existing: { igMediaId: "ig-media-1", fbPostId: null },
      onState: async (state) => {
        saved.push(`${state.instagram.kind}:${state.facebook.kind}`);
        return { kind: "saved" };
      },
      fetchImpl,
    });

    expect(result.kind).toBe("published");
    expect(result.instagram).toMatchObject({ kind: "published", skipped: true, id: "ig-media-1" });
    expect(result.facebook).toMatchObject({ kind: "published", skipped: false, id: "page-1_fb-1" });
    expect(calls.some((c) => c.url.includes("/media_publish"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/photos?"))).toBe(true);
    expect(saved).toEqual(["published:in_flight", "published:published"]);
  });

  it("falha ao persistir o id depois da chamada vira uncertain, sem republicar", async () => {
    let saves = 0;
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "17841400000000001" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000002" } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      onState: async () => {
        saves += 1;
        return saves === 1 ? { kind: "saved" } : { kind: "failed", error: "db down" };
      },
      fetchImpl,
    });

    expect(result.kind).toBe("uncertain");
    expect(result.instagram).toMatchObject({ kind: "published", id: "17841400000000002" });
    expect(calls.filter((call) => call.url.includes("/media_publish")).length).toBe(1);
  });

  it("claim concorrente: só um worker publica", async () => {
    let claims = 0;
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });

    const run = () =>
      publishToChannels({
        ...meta,
        imageUrl: "https://cdn/arte.jpg",
        caption: "post do evento",
        requireFacebook: true,
        onState: async () => {
          claims += 1;
          return claims === 1 ? { kind: "saved" } : { kind: "conflict", error: "claim perdido" };
        },
        fetchImpl,
      });

    const results = await Promise.all([run(), run()]);
    expect(results.filter((result) => result.kind !== "failed")).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes("/media_publish")).length).toBe(1);
  });

  it("IG media_publish 5xx vira uncertain, não failed", async () => {
    const saved: string[] = [];
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish"))
        return { status: 503, body: { error: { message: "upstream" } } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      onState: async (state) => {
        saved.push(state.instagram.kind);
        return { kind: "saved" };
      },
      fetchImpl,
    });

    expect(result.kind).toBe("uncertain");
    expect(result.instagram.kind).toBe("uncertain");
    expect(saved).toContain("uncertain");
    expect(saved).not.toContain("failed");
  });

  it("FB 5xx vira uncertain, não failed", async () => {
    const saved: string[] = [];
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?"))
        return { status: 502, body: { error: { message: "bad gateway" } } };
      return { body: {} };
    });

    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      onState: async (state) => {
        saved.push(state.facebook.kind);
        return { kind: "saved" };
      },
      fetchImpl,
    });

    expect(result.kind).toBe("uncertain");
    expect(result.facebook.kind).toBe("uncertain");
    expect(saved).toContain("uncertain");
    expect(saved).not.toContain("failed");
  });

  it("estado in_flight/uncertain bloqueia republicação cega", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: {} }));
    const result = await publishToChannels({
      ...meta,
      imageUrl: "https://cdn/arte.jpg",
      caption: "post do evento",
      requireFacebook: true,
      initialState: {
        version: 1,
        instagram: { kind: "uncertain", reason: "crash" },
        facebook: { kind: "pending" },
      },
      fetchImpl,
    });
    expect(result.kind).not.toBe("published");
    expect(result.instagram).toMatchObject({ kind: "blocked", reason: "uncertain" });
    expect(calls.some((call) => call.url.includes("/media_publish"))).toBe(false);
  });
});

describe("exclusão remota estruturada", () => {
  it("Facebook: 404 NÃO confirma ausência e mantém a ref", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 404,
      body: { error: { message: "Object does not exist" } },
    }));

    const result = await deleteFacebookPost({ ...meta, postId: "page-1_fb-1", fetchImpl });
    expect(result.kind).toBe("not_confirmed_absent");
    expect(calls[0]).toMatchObject({
      url: "https://graph.facebook.com/v26.0/page-1_fb-1",
      method: "DELETE",
      auth: "Bearer page-token",
    });
  });

  it("só 2xx com success:true limpa a referência", async () => {
    const yes = fakeFetch(() => ({ body: { success: true } }));
    await expect(
      deleteFacebookPost({ ...meta, postId: "p1", fetchImpl: yes.fetchImpl }),
    ).resolves.toMatchObject({ kind: "deleted", id: "p1" });

    const no = fakeFetch(() => ({ body: { success: false } }));
    await expect(
      deleteFacebookPost({ ...meta, postId: "p1", fetchImpl: no.fetchImpl }),
    ).resolves.toMatchObject({ kind: "not_confirmed_absent" });
  });

  it("Instagram: graph.instagram.com é unsupported sem chamada; 404 não confirma", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      deleteMedia({ ...meta, apiHost: "graph.instagram.com", mediaId: "ig-1", fetchImpl }),
    ).resolves.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);

    const absent = (async () =>
      new Response(JSON.stringify({ error: { message: "not found" } }), {
        status: 404,
      })) as unknown as typeof fetch;
    await expect(
      deleteMedia({ ...meta, mediaId: "ig-2", fetchImpl: absent }),
    ).resolves.toMatchObject({
      kind: "not_confirmed_absent",
    });
  });

  it("credenciais ausentes e 100/33 não limpam refs", async () => {
    await expect(deleteMedia({ ...meta, accessToken: "", mediaId: "ig-1" })).resolves.toMatchObject(
      {
        kind: "missing_credentials",
      },
    );
    const ambiguous = (async () =>
      new Response(
        JSON.stringify({
          error: { message: "Object does not exist", code: 100, error_subcode: 33 },
        }),
        { status: 400 },
      )) as unknown as typeof fetch;
    await expect(
      deleteMedia({ ...meta, mediaId: "ig-2", fetchImpl: ambiguous }),
    ).resolves.toMatchObject({
      kind: "not_confirmed_absent",
    });
  });

  it("token/permissão e 2207085 não limpam refs", async () => {
    const forbidden = (async () =>
      new Response(JSON.stringify({ error: { message: "permission denied", code: 190 } }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(
      deleteMedia({ ...meta, mediaId: "ig-1", fetchImpl: forbidden }),
    ).resolves.toMatchObject({
      kind: "permission_or_token",
    });

    const subcode = (async () =>
      new Response(
        JSON.stringify({ error: { message: "delete failed", code: 1, error_subcode: 2207085 } }),
        { status: 400 },
      )) as unknown as typeof fetch;
    await expect(
      deleteMedia({ ...meta, mediaId: "ig-2", fetchImpl: subcode }),
    ).resolves.toMatchObject({
      kind: "unknown",
    });
  });
});

describe("publishFacebookPagePost", () => {
  it("exige a Página configurada", async () => {
    const result = await publishFacebookPagePost({
      igUserId: "ig",
      accessToken: "tok",
      imageUrl: "https://cdn/x.jpg",
      caption: "x",
    });
    expect(result.ok).toBe(false);
  });
});
