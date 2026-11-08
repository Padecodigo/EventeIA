import { describe, expect, it, vi } from "vitest";

import { uploadTiktokDraft, type TiktokDraftDeps } from "@/lib/tiktok/draft";

const UPLOAD_URL = "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x";

function makeDeps(overrides: Partial<TiktokDraftDeps> = {}): TiktokDraftDeps {
  return {
    getAccessToken: vi.fn().mockResolvedValue({
      ok: true,
      accessToken: "access-token",
      environment: "sandbox",
      accountId: "account-1",
    }),
    initUpload: vi.fn().mockResolvedValue({
      ok: true,
      data: { publish_id: "publish-1", upload_url: UPLOAD_URL },
    }),
    uploadVideo: vi.fn().mockResolvedValue({ ok: true, data: { status: 201 } }),
    ...overrides,
  };
}

function videoFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], "draft.mp4", { type: "video/mp4" });
}

describe("uploadTiktokDraft", () => {
  it("inicializa e envia o vídeo inteiro para o inbox", async () => {
    const deps = makeDeps();

    const result = await uploadTiktokDraft(videoFile(), deps);

    expect(result).toEqual({ ok: true, publishId: "publish-1" });
    expect(deps.getAccessToken).toHaveBeenCalledOnce();
    expect(deps.initUpload).toHaveBeenCalledWith({
      accessToken: "access-token",
      videoSizeBytes: 4,
      chunkSizeBytes: 4,
      totalChunkCount: 1,
    });
    expect(deps.uploadVideo).toHaveBeenCalledWith({
      uploadUrl: UPLOAD_URL,
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "video/mp4",
    });
  });

  it("não lê token nem chama o TikTok para arquivo inválido", async () => {
    const deps = makeDeps();

    const result = await uploadTiktokDraft(
      new File(["x"], "draft.png", { type: "image/png" }),
      deps,
    );

    expect(result).toEqual({ ok: false, error: "Envie um vídeo MP4, MOV ou WebM." });
    expect(deps.getAccessToken).not.toHaveBeenCalled();
    expect(deps.initUpload).not.toHaveBeenCalled();
  });

  it("falha fechado quando não há conta/token ativo", async () => {
    const deps = makeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ ok: false, reason: "missing_account" }),
    });

    const result = await uploadTiktokDraft(videoFile(), deps);

    expect(result).toEqual({
      ok: false,
      error: "Nenhuma conta TikTok conectada no ambiente ativo.",
    });
    expect(deps.initUpload).not.toHaveBeenCalled();
  });

  it("mapeia token expirado para mensagem de reconexão", async () => {
    const deps = makeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ ok: false, reason: "expired" }),
    });

    await expect(uploadTiktokDraft(videoFile(), deps)).resolves.toEqual({
      ok: false,
      error: "O token do TikTok expirou. Reconecte a conta.",
    });
  });

  it("recusa conta salva sem criptografia", async () => {
    const deps = makeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ ok: false, reason: "not_encrypted" }),
    });

    await expect(uploadTiktokDraft(videoFile(), deps)).resolves.toEqual({
      ok: false,
      error: "A conta do TikTok foi salva sem criptografia. Reconecte a conta.",
    });
    expect(deps.initUpload).not.toHaveBeenCalled();
  });

  it("não envia bytes quando a inicialização falha", async () => {
    const deps = makeDeps({
      initUpload: vi.fn().mockResolvedValue({ ok: false, error: "invalid_param", status: 400 }),
    });

    const result = await uploadTiktokDraft(videoFile(), deps);

    expect(result).toEqual({
      ok: false,
      error: "Não foi possível iniciar o rascunho no TikTok. Tente novamente.",
    });
    expect(deps.uploadVideo).not.toHaveBeenCalled();
  });

  it("recusa upload_url fora do domínio oficial antes de enviar bytes", async () => {
    const deps = makeDeps({
      initUpload: vi.fn().mockResolvedValue({
        ok: true,
        data: { publish_id: "publish-1", upload_url: "https://evil.com/video/?upload_id=1" },
      }),
    });

    const result = await uploadTiktokDraft(videoFile(), deps);

    expect(result).toEqual({
      ok: false,
      error: "O TikTok devolveu um endereço de upload inválido.",
    });
    expect(deps.uploadVideo).not.toHaveBeenCalled();
  });

  it("sanitiza falha do PUT sem expor detalhes do TikTok", async () => {
    const deps = makeDeps({
      uploadVideo: vi.fn().mockResolvedValue({
        ok: false,
        error: "segredo interno do provedor",
        status: 403,
      }),
    });

    const result = await uploadTiktokDraft(videoFile(), deps);

    expect(result).toEqual({
      ok: false,
      error: "Não foi possível enviar o vídeo ao TikTok. Tente novamente.",
    });
  });
});
