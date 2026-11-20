import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createComment,
  deleteComment,
  listMediaComments,
  listRecentMedia,
  replyToComment,
  setCommentHidden,
} from "@/lib/meta/comments";

const baseInput = {
  accessToken: "tok",
  apiVersion: "v26.0",
};

function makeFetcher(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("listRecentMedia", () => {
  it("monta a URL com media e fields e não expõe o token", async () => {
    const fetcher = makeFetcher({ data: [] });
    await listRecentMedia({ ...baseInput, igUserId: "123", fetchImpl: fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v26.0/123/media");
    expect(url).toContain("fields=");
    expect(url).not.toContain("tok");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("mapeia previewUrl e commentsCount para VIDEO e IMAGE", async () => {
    const fetcher = makeFetcher({
      data: [
        {
          id: "1",
          media_type: "VIDEO",
          media_url: "http://m/v.mp4",
          thumbnail_url: "http://m/v.jpg",
          comments_count: 4,
        },
        {
          id: "2",
          media_type: "IMAGE",
          media_url: "http://m/i.jpg",
          thumbnail_url: "http://m/i-thumb.jpg",
          comments_count: "7",
        },
      ],
    });
    const result = await listRecentMedia({ ...baseInput, igUserId: "123", fetchImpl: fetcher });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].previewUrl).toBe("http://m/v.jpg");
    expect(result.data[0].commentsCount).toBe(4);
    expect(result.data[1].previewUrl).toBe("http://m/i.jpg");
    expect(result.data[1].commentsCount).toBe(7);
  });
});

describe("listMediaComments", () => {
  it("interpreta replies e hidden", async () => {
    const fetcher = makeFetcher({
      data: [
        {
          id: "10",
          text: "comentário",
          username: "alice",
          hidden: true,
          replies: { data: [{ id: "11", text: "resposta", hidden: false }] },
        },
      ],
    });
    const result = await listMediaComments({ ...baseInput, mediaId: "42", fetchImpl: fetcher });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].hidden).toBe(true);
    expect(result.data[0].replies).toHaveLength(1);
    expect(result.data[0].replies[0].id).toBe("11");
    expect(result.data[0].replies[0].text).toBe("resposta");
  });
});

describe("createComment", () => {
  it("envia JSON com a mensagem via POST para /comments", async () => {
    const fetcher = makeFetcher({ id: "c1" });
    const result = await createComment({
      ...baseInput,
      mediaId: "999",
      message: "Olá",
      fetchImpl: fetcher,
    });

    expect(result).toEqual({ ok: true, data: { id: "c1" } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v26.0/999/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "Olá" });
  });

  it("recusa mensagem vazia", async () => {
    const fetcher = makeFetcher({ id: "c1" });
    const result = await createComment({
      ...baseInput,
      mediaId: "999",
      message: "  ",
      fetchImpl: fetcher,
    });
    expect(result).toEqual({ ok: false, error: "mensagem vazia", status: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("recusa mensagem longa demais", async () => {
    const fetcher = makeFetcher({ id: "c1" });
    const result = await createComment({
      ...baseInput,
      mediaId: "999",
      message: "a".repeat(2201),
      fetchImpl: fetcher,
    });
    expect(result).toEqual({ ok: false, error: "mensagem longa demais", status: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("replyToComment", () => {
  it("envia POST para /555/replies", async () => {
    const fetcher = makeFetcher({ id: "r1" });
    const result = await replyToComment({
      ...baseInput,
      commentId: "555",
      message: "Olá",
      fetchImpl: fetcher,
    });

    expect(result).toEqual({ ok: true, data: { id: "r1" } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v26.0/555/replies");
    expect(init.method).toBe("POST");
  });
});

describe("setCommentHidden", () => {
  it("envia {hide:true} via POST para /555", async () => {
    const fetcher = makeFetcher({ success: true });
    const result = await setCommentHidden({
      ...baseInput,
      commentId: "555",
      hidden: true,
      fetchImpl: fetcher,
    });

    expect(result).toEqual({ ok: true, data: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v26.0/555");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ hide: true });
  });
});

describe("deleteComment", () => {
  it("usa o método DELETE", async () => {
    const fetcher = makeFetcher({ success: true });
    const result = await deleteComment({ ...baseInput, commentId: "555", fetchImpl: fetcher });

    expect(result).toEqual({ ok: true, data: true });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});

describe("validação de id", () => {
  it("recusa id inválido sem chamar fetch", async () => {
    const fetcher = makeFetcher({ data: [] });
    const result = await createComment({
      ...baseInput,
      mediaId: "abc",
      message: "Olá",
      fetchImpl: fetcher,
    });
    expect(result).toEqual({ ok: false, error: "id inválido", status: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("erros da Graph API", () => {
  let fetcher: ReturnType<typeof makeFetcher>;
  beforeEach(() => {
    fetcher = makeFetcher({ error: { message: "Unsupported" } }, 400);
  });

  it("propaga a mensagem e o status do erro", async () => {
    const result = await listRecentMedia({ ...baseInput, igUserId: "123", fetchImpl: fetcher });
    expect(result).toEqual({ ok: false, error: "Unsupported", status: 400 });
  });

  it("retorna status null quando a rede falha", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await listRecentMedia({ ...baseInput, igUserId: "123", fetchImpl: failing });
    expect(result).toEqual({
      ok: false,
      error: "falha de rede ao chamar a Graph API",
      status: null,
    });
  });
});
