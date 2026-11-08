import { describe, expect, it, vi } from "vitest";

import {
  creatorInfo,
  exchangeCodeForToken,
  fetchPublishStatus,
  isTrustedTiktokUploadUrl,
  uploadPhotoInit,
  uploadVideoInit,
  uploadVideoToTiktok,
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

    const result = await exchangeCodeForToken({
      code: "code-xyz",
      clientKey: "ck",
      clientSecret: "cs",
      redirectUri: "https://app.example/tiktok/callback",
      codeVerifier: "verifier",
      fetchImpl: fetchMock,
    });

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
      fetchImpl: fetchMock,
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
      fetchImpl: fetchMock,
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
  it("faz POST /v2/post/publish/inbox/video/init/ somente com source_info", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        publish_id: "p1",
        upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1",
      }),
    );

    const result = await uploadVideoInit({
      accessToken: "at",
      title: "Meu vídeo",
      videoSizeBytes: 1000,
      chunkSizeBytes: 1000,
      totalChunkCount: 1,
      fetchImpl: fetchMock,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/inbox/video/init/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer at");

    const body: unknown = JSON.parse(init.body as string);
    expect(body).toEqual({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: 1000,
        chunk_size: 1000,
        total_chunk_count: 1,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.publish_id).toBe("p1");
  });

  it.each([
    { data: {} },
    { data: { publish_id: "p1" } },
    { data: { publish_id: "p1", upload_url: 42 } },
    { data: { publish_id: "", upload_url: "https://open-upload.tiktokapis.com/video/" } },
  ])("rejeita resposta de init com shape inválido (%j)", async (payload) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await uploadVideoInit({
      accessToken: "at",
      videoSizeBytes: 1000,
      chunkSizeBytes: 1000,
      totalChunkCount: 1,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ ok: false, error: "resposta de upload inválida", status: null });
  });

  it("trata HTTP 200 com error.code != ok como falha da aplicação", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "spam_risk_too_many_pending_share", message: "limite de rascunhos" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await uploadVideoInit({
      accessToken: "at",
      videoSizeBytes: 1000,
      chunkSizeBytes: 1000,
      totalChunkCount: 1,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      ok: false,
      error: "limite de rascunhos",
      status: 200,
    });
  });
});

describe("uploadVideoToTiktok", () => {
  it("faz PUT no upload_url oficial com headers de chunk único", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const result = await uploadVideoToTiktok({
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x",
      bytes,
      contentType: "video/mp4",
      fetchImpl: fetchMock,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.origin).toBe("https://open-upload.tiktokapis.com");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({
      "Content-Type": "video/mp4",
      "Content-Length": "4",
      "Content-Range": "bytes 0-3/4",
    });
    expect(init.redirect).toBe("error");
    expect(init.body).toBeInstanceOf(Blob);
    const body = init.body as Blob;
    expect(body.type).toBe("video/mp4");
    expect(new Uint8Array(await body.arrayBuffer())).toEqual(bytes);
    expect(result).toEqual({ ok: true, data: { status: 201 } });
  });

  it.each([307, 308])("não segue redirect %s nem trata como upload concluído", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status,
        headers: { location: "https://evil.com/video/?upload_id=atacante" },
      }),
    );

    const result = await uploadVideoToTiktok({
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1",
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "video/mp4",
      fetchImpl: fetchMock,
    });

    const [, init] = firstCall(fetchMock);
    expect(init.redirect).toBe("error");
    expect(result).toEqual({ ok: false, error: `HTTP ${String(status)}`, status });
  });

  it.each([
    "https://evil.com/video/?upload_id=1",
    "https://tiktokapis.com.evil.com/video/?upload_id=1",
    "http://open-upload.tiktokapis.com/video/?upload_id=1",
    "https://open-upload.tiktokapis.com/other/?upload_id=1",
    "https://user:pass@open-upload.tiktokapis.com/video/?upload_id=1",
    "not a url",
  ])("rejeita upload_url não confiável (%s)", (uploadUrl) => {
    expect(isTrustedTiktokUploadUrl(uploadUrl)).toBe(false);
  });

  it.each([
    "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x",
    "https://open-upload-sg.tiktokapis.com/upload?upload_id=1&upload_token=x",
    "https://upload.us.tiktokapis.com/video/?upload_id=1",
  ])("aceita upload_url confiável (%s)", (uploadUrl) => {
    expect(isTrustedTiktokUploadUrl(uploadUrl)).toBe(true);
  });

  it("não chama fetch quando o upload_url não é confiável", async () => {
    const fetchMock = vi.fn();

    const result = await uploadVideoToTiktok({
      uploadUrl: "https://evil.com/video/?upload_id=1",
      bytes: new Uint8Array([1]),
      contentType: "video/mp4",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "upload_url inválida", status: null });
  });

  it("propaga falha de status sem expor o corpo da resposta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("segredo interno", { status: 403 }));

    const result = await uploadVideoToTiktok({
      uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1",
      bytes: new Uint8Array([1]),
      contentType: "video/mp4",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ ok: false, error: "HTTP 403", status: 403 });
  });
});

describe("uploadPhotoInit", () => {
  it("faz POST /v2/post/publish/content/init/ com photo_files", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ publish_id: "p2", upload_url: "https://upload" }));

    const result = await uploadPhotoInit({
      accessToken: "at",
      title: "Fotos",
      photoFiles: [{ photoFileSize: 500, chunkSize: 500, totalChunkCount: 1 }],
      fetchImpl: fetchMock,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/content/init/");
    const body: unknown = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      source_info: { photo_files: [{ photo_file_size: 500 }] },
    });
    expect(result.ok).toBe(true);
  });
});

describe("fetchPublishStatus", () => {
  it("faz POST /v2/post/publish/status/fetch/ com publish_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ status: "PUBLISH_COMPLETE" }));

    const result = await fetchPublishStatus({
      accessToken: "at",
      publishId: "p9",
      fetchImpl: fetchMock,
    });

    const [url, init] = firstCall(fetchMock);
    expect(url.pathname).toBe("/v2/post/publish/status/fetch/");
    expect(JSON.parse(init.body as string)).toEqual({ publish_id: "p9" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("PUBLISH_COMPLETE");
  });
});
