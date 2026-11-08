import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecordMediaUseInput } from "@/lib/marketing/autopilot-media";
import { contentHash } from "@/lib/marketing/media-dedup";
import type { MarketingTheme } from "@/lib/marketing/themes";

const generateImage = vi.fn();
const serverEnv = vi.fn((): { MODELSLAB_API_KEY: string | undefined } => ({
  MODELSLAB_API_KEY: "k",
}));

vi.mock("@/lib/env", () => ({ serverEnv }));
vi.mock("@/lib/modelslab/client", () => ({ generateImage }));

const { buildReelFfmpegArgs, generatePostArt, generateReelArt, generateStoryArt, REEL_IMAGES } =
  await import("@/lib/marketing/autopilot-art");

const THEME: MarketingTheme = {
  key: "infantil",
  label: "Festa infantil",
  audience: "mães e pais",
  angle: "menos correria",
};

const bytesA = Buffer.from("imagem-a");
const bytesB = Buffer.from("imagem-b");
const bytesC = Buffer.from("imagem-c");
const bytesD = Buffer.from("imagem-d");
const bytesE = Buffer.from("imagem-e");
const bytesF = Buffer.from("imagem-f");

function fakeFetch(routes: Record<string, Buffer>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const bytes = routes[url];
    if (bytes === undefined) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as typeof fetch;
}

const recordUse = vi.fn(async (_input: RecordMediaUseInput) => undefined);
/** Marca na imagem simulando a logo (evita sharp real nos testes). */
const brandIdentity = vi.fn(async (bytes: Buffer) => bytes);

beforeEach(() => {
  generateImage.mockReset();
  serverEnv.mockReset();
  serverEnv.mockReturnValue({ MODELSLAB_API_KEY: "k" });
  recordUse.mockClear();
  brandIdentity.mockClear();
});

describe("arte do autopilot com FLUX", () => {
  it("gera a arte do post em 1080×1080 e registra o hash do conteúdo com a logo", async () => {
    generateImage.mockResolvedValue({ ok: true, images: ["https://cdn/a.jpg"], id: 1 });
    const storeImage = vi.fn(async () => "https://storage/1.jpg");

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      brandImage: brandIdentity,
      storeImage,
      fetchImpl: fakeFetch({ "https://cdn/a.jpg": bytesA }),
    });

    expect(result).toEqual({ url: "https://storage/1.jpg" });
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1080, height: 1080, samples: 1 }),
    );
    expect(brandIdentity).toHaveBeenCalledWith(bytesA);
    expect(storeImage).toHaveBeenCalledWith(bytesA);
    expect(recordUse).toHaveBeenCalledWith({
      mediaKey: contentHash(bytesA),
      kind: "post",
      theme: "infantil",
      url: "https://storage/1.jpg",
    });
  });

  it("gera a arte do story em 1080×1920", async () => {
    generateImage.mockResolvedValue({ ok: true, images: ["https://cdn/a.jpg"], id: 2 });
    const storeImage = vi.fn(async () => "https://storage/2.jpg");

    const result = await generateStoryArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      brandImage: brandIdentity,
      storeImage,
      fetchImpl: fakeFetch({ "https://cdn/a.jpg": bytesA }),
    });

    expect(result).toEqual({ url: "https://storage/2.jpg" });
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1080, height: 1920, samples: 1 }),
    );
  });

  it("regenera quando o conteúdo com a logo colide com uma imagem já usada", async () => {
    generateImage
      .mockResolvedValueOnce({ ok: true, images: ["https://cdn/a.jpg"], id: 1 })
      .mockResolvedValueOnce({ ok: true, images: ["https://cdn/b.jpg"], id: 2 });
    const storeImage = vi.fn(async () => "https://storage/3.jpg");

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [{ key: contentHash(bytesA), usedAtMs: 0 }],
      recordUse,
      brandImage: brandIdentity,
      storeImage,
      fetchImpl: fakeFetch({ "https://cdn/a.jpg": bytesA, "https://cdn/b.jpg": bytesB }),
    });

    expect(result).toEqual({ url: "https://storage/3.jpg" });
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(recordUse).toHaveBeenCalledTimes(1);
    expect(recordUse).toHaveBeenCalledWith(
      expect.objectContaining({ mediaKey: contentHash(bytesB) }),
    );
  });

  it("retorna null quando o FLUX falha", async () => {
    generateImage.mockResolvedValue({ ok: false, error: "erro", status: 500 });

    expect(
      await generatePostArt(THEME, {
        loadUsed: async () => [],
        recordUse,
        brandImage: brandIdentity,
      }),
    ).toBeNull();
    expect(recordUse).not.toHaveBeenCalled();
  });

  it("retorna null sem API key", async () => {
    serverEnv.mockReturnValue({ MODELSLAB_API_KEY: undefined });

    expect(
      await generatePostArt(THEME, {
        loadUsed: async () => [],
        recordUse,
        brandImage: brandIdentity,
      }),
    ).toBeNull();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("monta o reel com 3 imagens únicas (com a logo) e registra cada hash", async () => {
    generateImage.mockResolvedValue({
      ok: true,
      images: ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"],
      id: 3,
    });
    const renderReel = vi.fn(async () => Buffer.from("mp4-bytes"));
    const storeVideo = vi.fn(async () => "https://storage/reel.mp4");

    const result = await generateReelArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      brandImage: brandIdentity,
      renderReel,
      storeVideo,
      fetchImpl: fakeFetch({
        "https://cdn/a.jpg": bytesA,
        "https://cdn/b.jpg": bytesB,
        "https://cdn/c.jpg": bytesC,
      }),
    });

    expect(result).toEqual({ url: "https://storage/reel.mp4" });
    expect(REEL_IMAGES).toBe(3);
    expect(brandIdentity).toHaveBeenCalledTimes(3);
    expect(renderReel).toHaveBeenCalledTimes(1);
    expect(storeVideo).toHaveBeenCalledWith(Buffer.from("mp4-bytes"));
    expect(recordUse).toHaveBeenCalledTimes(3);
    expect(recordUse.mock.calls.map((c) => c[0]?.mediaKey).sort()).toEqual(
      [bytesA, bytesB, bytesC].map((b) => contentHash(b)).sort(),
    );
  });

  it("regenera o reel quando uma das imagens colide", async () => {
    generateImage
      .mockResolvedValueOnce({
        ok: true,
        images: ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"],
        id: 1,
      })
      .mockResolvedValueOnce({
        ok: true,
        images: ["https://cdn/d.jpg", "https://cdn/e.jpg", "https://cdn/f.jpg"],
        id: 2,
      });
    const renderReel = vi.fn(async () => Buffer.from("mp4-bytes"));
    const storeVideo = vi.fn(async () => "https://storage/reel.mp4");

    const result = await generateReelArt(THEME, {
      loadUsed: async () => [{ key: contentHash(bytesB), usedAtMs: 0 }],
      recordUse,
      brandImage: brandIdentity,
      renderReel,
      storeVideo,
      fetchImpl: fakeFetch({
        "https://cdn/a.jpg": bytesA,
        "https://cdn/b.jpg": bytesB,
        "https://cdn/c.jpg": bytesC,
        "https://cdn/d.jpg": bytesD,
        "https://cdn/e.jpg": bytesE,
        "https://cdn/f.jpg": bytesF,
      }),
    });

    expect(result).toEqual({ url: "https://storage/reel.mp4" });
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(recordUse.mock.calls.map((c) => c[0]?.mediaKey).sort()).toEqual(
      [bytesD, bytesE, bytesF].map((b) => contentHash(b)).sort(),
    );
  });

  it("retorna null no reel quando não há 3 imagens", async () => {
    generateImage.mockResolvedValue({ ok: false, error: "sem imagem", status: 500 });
    const renderReel = vi.fn();
    const storeVideo = vi.fn();

    expect(
      await generateReelArt(THEME, {
        loadUsed: async () => [],
        recordUse,
        brandImage: brandIdentity,
        renderReel,
        storeVideo,
      }),
    ).toBeNull();
    expect(renderReel).not.toHaveBeenCalled();
    expect(storeVideo).not.toHaveBeenCalled();
  });
});

describe("argumentos do ffmpeg do reel", () => {
  it("constrói o slideshow com zoom e concat de 3 entradas", () => {
    const args = buildReelFfmpegArgs(["a.jpg", "b.jpg", "c.jpg"], "out.mp4");

    expect(args[0]).toBe("-y");
    const fcIndex = args.indexOf("-filter_complex");
    expect(fcIndex).toBeGreaterThan(0);
    const filter = args[fcIndex + 1];
    expect(filter).toContain("zoompan");
    expect(filter).toContain("concat=n=3:v=1:a=0");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("a.jpg");
    expect(args).toContain("b.jpg");
    expect(args).toContain("c.jpg");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("é determinístico", () => {
    expect(buildReelFfmpegArgs(["a.jpg", "b.jpg"], "x.mp4")).toEqual(
      buildReelFfmpegArgs(["a.jpg", "b.jpg"], "x.mp4"),
    );
  });
});
