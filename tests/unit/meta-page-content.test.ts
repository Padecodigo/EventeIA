import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchPageProfile,
  listPagePosts,
} from "@/lib/meta/page-content";

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("lib/meta/page-content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchPageProfile", () => {
    it("mapeia name, link, fan_count e picture.data.url", async () => {
      const fetchImpl = vi.fn(async () =>
        makeResponse({
          id: "123",
          name: "Página Teste",
          link: "https://facebook.com/pagina",
          fan_count: 42,
          picture: { data: { url: "https://cdn.example.com/pic.jpg" } },
        }),
      );

      const result = await fetchPageProfile({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          id: "123",
          name: "Página Teste",
          link: "https://facebook.com/pagina",
          fanCount: 42,
          pictureUrl: "https://cdn.example.com/pic.jpg",
        },
      });
    });

    it("envia header Authorization Bearer e URL com /v26.0/123 sem token", async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ id: "123", name: "X" }));

      await fetchPageProfile({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchImpl.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toContain("/v26.0/123");
      expect(calledUrl).not.toContain("tok");
      const headers = calledInit.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer tok");
    });

    it("retorna ok false quando name está ausente", async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ id: "123" }));

      const result = await fetchPageProfile({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result).toEqual({
        ok: false,
        error: "resposta inválida da Graph API",
        status: 200,
      });
    });
  });

  describe("listPagePosts", () => {
    it("mapeia message, created_time, permalink_url e full_picture", async () => {
      const fetchImpl = vi.fn(async () =>
        makeResponse({
          data: [
            {
              id: "1",
              message: "Olá",
              created_time: "2024-01-01T00:00:00+0000",
              permalink_url: "https://facebook.com/p/1",
              full_picture: "https://cdn.example.com/full.jpg",
            },
          ],
        }),
      );

      const result = await listPagePosts({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result).toEqual({
        ok: true,
        data: [
          {
            id: "1",
            message: "Olá",
            createdTime: "2024-01-01T00:00:00+0000",
            permalinkUrl: "https://facebook.com/p/1",
            fullPicture: "https://cdn.example.com/full.jpg",
          },
        ],
      });
    });

    it("chama /123/posts com limit=10 na URL", async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ data: [] }));

      await listPagePosts({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const [calledUrl] = fetchImpl.mock.calls[0] as unknown as [string];
      expect(calledUrl).toContain("/123/posts");
      expect(calledUrl).toContain("limit=10");
    });

    it("limita limit 100 para 25 na URL", async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ data: [] }));

      await listPagePosts({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        limit: 100,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const [calledUrl] = fetchImpl.mock.calls[0] as unknown as [string];
      expect(calledUrl).toContain("limit=25");
      expect(calledUrl).not.toContain("limit=100");
    });
  });

  describe("validação de id", () => {
    it("id 'abc' retorna 'id inválido' e não chama fetch", async () => {
      const fetchImpl = vi.fn(async () => makeResponse({}));

      const profile = await fetchPageProfile({
        pageId: "abc",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const posts = await listPagePosts({
        pageId: "abc",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(profile).toEqual({ ok: false, error: "id inválido", status: null });
      expect(posts).toEqual({ ok: false, error: "id inválido", status: null });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("erros da Graph API", () => {
    it("propaga mensagem de erro 400 e status", async () => {
      const fetchImpl = vi.fn(async () =>
        makeResponse(
          { error: { message: "(#10) Requires pages_read_engagement" } },
          400,
        ),
      );

      const result = await fetchPageProfile({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result).toEqual({
        ok: false,
        error: "(#10) Requires pages_read_engagement",
        status: 400,
      });
    });

    it("retorna status null quando há falha de rede", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("network down");
      });

      const result = await fetchPageProfile({
        pageId: "123",
        accessToken: "tok",
        apiVersion: "v26.0",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeNull();
        expect(result.error).toBe("falha de rede ao chamar a Graph API");
      }
    });
  });
});
