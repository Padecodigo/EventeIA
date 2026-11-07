import { describe, expect, it, vi } from "vitest";

import {
  creatorInfo,
  exchangeCodeForToken,
  fetchPublishStatus,
  uploadPhotoInit,
  uploadVideoInit,
  type TiktokResult,
} from "@/lib/tiktok/client";

/** Extrai (url, init) da primeira chamada do fetch mockado. */
function firstCall(fetchMock: ReturnType<typeof vi.fn>): [URL, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) throw new Error("fetch não foi chamado");
  return [new URL(String(call[0])), call[1] as RequestInit];
}

function okJson<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("exchangeCodeForToken", () => {
  it("faz POST para /v2/oauth/token/ com body form-urlencoded correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "at-1",
          refresh_token: "rt-1",
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: "open-1",
          scope: "user.info.basic,video.upload",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = (await exchangeCodeForToken({
      code: "code-xyz",
      clientKey: "ck",
      clientSecret: "cs",
      redirectUri: "https://app.example/tiktok/callback",
      codeVerifier: "verifier",
      fetchImpl: fetchMock as unknown as typeof fetch,
    })) as TiktokResult<{ access_token: string }>;

    const [url, init] = firstCall(fetchMock);
    expect(url.origin).toBe("https://open.tiktokapis.com");
    expect(url.pathname).toBe("/v2/oauth/token/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const body = new URLSearchParams(init.body as string);
    expect(body.get("client_key")).toBe("ck");
    expect(body.get("client_secret")).toBe("cs");
    expect(body.get("code")).toBe("code-xyz");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe("https://app.example/tiktok/callback");
    expect(body.get("code_verifier")).toBe("verifier");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.access_token).toBe("at-1");
  });

  it("propaga erro de token com error_description", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "code ruim" }), {
        status: 400,
      }),
    );
    const result = await exchangeCodeForToken({
      code: "x",
      clientKey: "ck",
      clientSecret: "cs",
      redirectUri: "https://app.example/cb",
      codeVerifier: "v",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("code ruim");
  });
});

describe("creatorInfo", () => {
  it("faz GET /v2/user/info/ com fields e Bearer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ user: { open_id: "o1", display_name: "Ana", avatar_url: "u" } }));

    const result = await creatorInfo({
      accessToken: "at",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.origin).toBe("https://open.tiktokapis.com");
    expect(url.pathname).toBe("/v2/user/info/");
    expect(url.searchParams.get("fields")).toBe("open_id,display_name,avatar_url");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer at");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.display_name).toBe("Ana");
      expect(result.data.open_id).toBe("o1");
    }
  });
});

describe("uploadVideoInit", () => {
  it("faz POST /v2/post/publish/inbox/video/init/ (draft)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ publish_id: "p1", upload_url: "https://upload" }),
    );

    const result = await uploadVideoInit({
      accessToken: "at",
      title: "Meu vídeo",
      videoSizeBytes: 1000,
      chunkSizeBytes: 1000,
      totalChunkCount: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/inbox/video/init/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer at");

    const body = JSON.parse(init.body as string);
    expect(body.post_info.title).toBe("Meu vídeo");
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
    expect(body.source_info.source).toBe("FILE_UPLOAD");
    expect(body.source_info.video_size).toBe(1000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.publish_id).toBe("p1");
  });
});

describe("uploadPhotoInit", () => {
  it("faz POST /v2/post/publish/content/init/ com photo_files", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ publish_id: "p2", upload_url: "https://upload" }),
    );

    const result = await uploadPhotoInit({
      accessToken: "at",
      title: "Fotos",
      photoFiles: [{ photoFileSize: 500, chunkSize: 500, totalChunkCount: 1 }],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/content/init/");
    const body = JSON.parse(init.body as string);
    expect(body.source_info.photo_files[0].photo_file_size).toBe(500);
    expect(result.ok).toBe(true);
  });
});

describe("fetchPublishStatus", () => {
  it("faz POST /v2/post/publish/status/fetch/ com publish_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ status: "PUBLISH_COMPLETE" }));

    const result = await fetchPublishStatus({
      accessToken: "at",
      publishId: "p9",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/status/fetch/");
    expect(JSON.parse(init.body as string)).toEqual({ publish_id: "p9" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("PUBLISH_COMPLETE");
  });
});
