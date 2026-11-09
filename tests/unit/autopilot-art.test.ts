import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerateImageInput } from "@/lib/modelslab/client";
import { contentHash } from "@/lib/marketing/media-dedup";
import type { MarketingTheme } from "@/lib/marketing/themes";

const activeImageApiKey = vi.fn(() => "test-key");

vi.mock("@/lib/prospecting/image-key", () => ({ activeImageApiKey }));

const { buildReelFfmpegArgs, generatePostArt, generateReelArt, generateStoryArt } =
  await import("@/lib/marketing/autopilot-art");

const THEME: MarketingTheme = {
  key: "infantil",
  label: "Festa infantil",
  audience: "mães e pais",
  angle: "menos correria",
};

const HEADLINE = ["A festa que ele", "vai lembrar.", "Você presente em cada momento."];
const SCENE_URL = "https://flux.test/scene-1.jpg";
const bytesScene = Buffer.from("cena-flux-a");
const bytesComposed = Buffer.from("cena-com-banner-e-cards");

/** Resultado `ok` de geração FLUX (cena pronta para download). */
const okResult = (url: string) => ({ ok: true as const, images: [url], id: null });

function fakeFetch(routes: Record<string, Buffer>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const bytes = routes[url];
    if (bytes === undefined) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as typeof fetch;
}

const recordUse = vi.fn(async () => undefined);
/** Simula a composição banner+cards (evita sharp real nos testes). */
const buildImage = vi.fn(async (_bytes: Buffer) => bytesComposed);
/** Simula a geração FLUX da cena (evita rede real nos testes). */
const generateImage = vi.fn(async (_input: GenerateImageInput) => okResult(SCENE_URL));

beforeEach(() => {
  activeImageApiKey.mockReset();
  activeImageApiKey.mockReturnValue("test-key");
  recordUse.mockClear();
  buildImage.mockClear();
  generateImage.mockClear();
});

describe("arte do autopilot com FLUX (cena) + sharp (banner + cards)", () => {
  it("gera a cena via FLUX, compõe banner+cards e registra o hash", async () => {
    const storeImage = vi.fn(async () => "https://storage/1.jpg");

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      generateImage,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [SCENE_URL]: bytesScene }),
    });

    expect(result).toEqual({ url: "https://storage/1.jpg" });

    expect(generateImage).toHaveBeenCalledTimes(1);
    const gen = generateImage.mock.calls[0][0];
    expect(gen.apiKey).toBe("test-key");
    expect(gen.width).toBe(1080);
    expect(gen.height).toBe(1080);
    expect(gen.prompt).not.toContain("Orçamento recebido");
    expect(gen.prompt).not.toContain(HEADLINE[0]);

    expect(buildImage).toHaveBeenCalledWith(
      bytesScene,
      HEADLINE,
      ["Buffet infantil", "Decoração"],
      {
        width: 1080,
        height: 1080,
      },
    );
    expect(storeImage).toHaveBeenCalledWith(bytesComposed);
    expect(recordUse).toHaveBeenCalledWith({
      mediaKey: contentHash(bytesComposed),
      kind: "post",
      theme: "infantil",
      url: "https://storage/1.jpg",
    });
  });

  it("story usa 1080×1920 e prompt vertical", async () => {
    const storeImage = vi.fn(async () => "https://storage/2.jpg");

    await generateStoryArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      generateImage,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [SCENE_URL]: bytesScene }),
    });

    const gen = generateImage.mock.calls[0][0];
    expect(gen.width).toBe(1080);
    expect(gen.height).toBe(1920);
    expect(gen.prompt).toContain("vertical composition for social media (9:16)");
    expect(buildImage).toHaveBeenCalledWith(
      bytesScene,
      HEADLINE,
      ["Buffet infantil", "Decoração"],
      {
        width: 1080,
        height: 1920,
      },
    );
  });

  it("variante emotional não aplica cards", async () => {
    const storeImage = vi.fn(async () => "https://storage/3.jpg");

    await generatePostArt(
      THEME,
      {
        loadUsed: async () => [],
        recordUse,
        generateImage,
        buildImage,
        storeImage,
        fetchImpl: fakeFetch({ [SCENE_URL]: bytesScene }),
      },
      "emotional",
    );

    expect(generateImage.mock.calls[0][0].prompt).not.toContain("Orçamento recebido");
    expect(buildImage).toHaveBeenCalledWith(bytesScene, HEADLINE, [], {
      width: 1080,
      height: 1080,
    });
  });

  it("não republica cena repetida: tenta de novo e desiste sem gravar a foto antiga", async () => {
    const storeImage = vi.fn();

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [{ key: contentHash(bytesComposed), usedAtMs: 0 }],
      recordUse,
      generateImage,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [SCENE_URL]: bytesScene }),
    });

    expect(result).toBeNull();
    expect(generateImage).toHaveBeenCalledTimes(3);
    expect(storeImage).not.toHaveBeenCalled();
    const prompts = generateImage.mock.calls.map((call) => call[0].prompt);
    expect(new Set(prompts).size).toBe(3);
  });

  it("retorna null quando a geração FLUX falha", async () => {
    const failingGenerate = vi.fn(async (_input: GenerateImageInput) => ({
      ok: false as const,
      error: "HTTP 500",
      status: 500,
    }));

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      generateImage: failingGenerate,
      buildImage,
      storeImage: vi.fn(),
      fetchImpl: fakeFetch({}),
    });

    expect(result).toBeNull();
    expect(recordUse).not.toHaveBeenCalled();
  });

  it("retorna null quando o download da cena falha", async () => {
    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      generateImage,
      buildImage,
      storeImage: vi.fn(),
      fetchImpl: fakeFetch({}), // SCENE_URL ausente → 404
    });

    expect(result).toBeNull();
    expect(recordUse).not.toHaveBeenCalled();
  });

  it("monta o reel com 3 cenas FLUX distintas e registra o hash do vídeo", async () => {
    const reelGenerate = vi.fn(async (_input: GenerateImageInput) =>
      okResult("https://flux.test/s0.jpg"),
    );
    reelGenerate
      .mockResolvedValueOnce(okResult("https://flux.test/s1.jpg"))
      .mockResolvedValueOnce(okResult("https://flux.test/s2.jpg"))
      .mockResolvedValueOnce(okResult("https://flux.test/s3.jpg"));

    const renderReel = vi.fn(async () => Buffer.from("mp4-bytes"));
    const storeVideo = vi.fn(async () => "https://storage/reel.mp4");
    const reelBuild = vi.fn(async (bytes: Buffer) => Buffer.concat([Buffer.from("reel-"), bytes]));

    const result = await generateReelArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      generateImage: reelGenerate,
      buildImage: reelBuild,
      renderReel,
      storeVideo,
      fetchImpl: fakeFetch({
        "https://flux.test/s1.jpg": Buffer.from("s1"),
        "https://flux.test/s2.jpg": Buffer.from("s2"),
        "https://flux.test/s3.jpg": Buffer.from("s3"),
      }),
    });

    expect(result).toEqual({ url: "https://storage/reel.mp4" });

    expect(reelGenerate).toHaveBeenCalledTimes(3);
    for (const call of reelGenerate.mock.calls) {
      expect(call[0].width).toBe(1080);
      expect(call[0].height).toBe(1920);
      expect(call[0].prompt).not.toContain("Orçamento recebido");
    }

    expect(reelBuild).toHaveBeenCalledTimes(3);
    expect(reelBuild.mock.calls[0][0]).toEqual(Buffer.from("s1"));
    expect(reelBuild.mock.calls[1][0]).toEqual(Buffer.from("s2"));
    expect(reelBuild.mock.calls[2][0]).toEqual(Buffer.from("s3"));

    expect(renderReel).toHaveBeenCalledWith([
      Buffer.concat([Buffer.from("reel-"), Buffer.from("s1")]),
      Buffer.concat([Buffer.from("reel-"), Buffer.from("s2")]),
      Buffer.concat([Buffer.from("reel-"), Buffer.from("s3")]),
    ]);
    expect(storeVideo).toHaveBeenCalledWith(Buffer.from("mp4-bytes"));
    expect(recordUse).toHaveBeenCalledWith({
      mediaKey: contentHash(Buffer.from("mp4-bytes")),
      kind: "reel",
      theme: "infantil",
      url: "https://storage/reel.mp4",
    });
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
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("é determinístico", () => {
    expect(buildReelFfmpegArgs(["a.jpg", "b.jpg"], "x.mp4")).toEqual(
      buildReelFfmpegArgs(["a.jpg", "b.jpg"], "x.mp4"),
    );
  });
});
