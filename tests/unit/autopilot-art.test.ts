import { beforeEach, describe, expect, it, vi } from "vitest";

import { contentHash } from "@/lib/marketing/media-dedup";
import type { MarketingTheme } from "@/lib/marketing/themes";

const serverEnv = vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }));

vi.mock("@/lib/env", () => ({ serverEnv }));

const { buildReelFfmpegArgs, generatePostArt, generateReelArt, generateStoryArt } =
  await import("@/lib/marketing/autopilot-art");

const THEME: MarketingTheme = {
  key: "infantil",
  label: "Festa infantil",
  audience: "mães e pais",
  angle: "menos correria",
};

const PHOTO_URL = "https://app.test/img/eventos/festa-infantil-velas.jpg";
const bytesA = Buffer.from("foto-real-a");

function fakeFetch(routes: Record<string, Buffer>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const bytes = routes[url];
    if (bytes === undefined) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as typeof fetch;
}

const recordUse = vi.fn(async () => undefined);
/** Marca a imagem simulando a composição dos cards (evita sharp real nos testes). */
const buildImage = vi.fn(async (bytes: Buffer) => bytes);

beforeEach(() => {
  serverEnv.mockReset();
  serverEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://app.test" });
  recordUse.mockClear();
  buildImage.mockClear();
});

describe("arte do autopilot com foto real + cards", () => {
  it("monta o post com foto real + cards e registra o hash do conteúdo", async () => {
    const storeImage = vi.fn(async () => "https://storage/1.jpg");

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [PHOTO_URL]: bytesA }),
    });

    expect(result).toEqual({ url: "https://storage/1.jpg" });
    expect(buildImage).toHaveBeenCalledWith(bytesA, ["Buffet infantil", "Decoração"], {
      width: 1080,
      height: 1080,
    });
    expect(storeImage).toHaveBeenCalledWith(bytesA);
    expect(recordUse).toHaveBeenCalledWith({
      mediaKey: contentHash(bytesA),
      kind: "post",
      theme: "infantil",
      url: "https://storage/1.jpg",
    });
  });

  it("story usa 1080×1920", async () => {
    const storeImage = vi.fn(async () => "https://storage/2.jpg");

    await generateStoryArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [PHOTO_URL]: bytesA }),
    });

    expect(buildImage).toHaveBeenCalledWith(bytesA, ["Buffet infantil", "Decoração"], {
      width: 1080,
      height: 1920,
    });
  });

  it("variante emotional não aplica cards", async () => {
    const storeImage = vi.fn(async () => "https://storage/3.jpg");

    await generatePostArt(
      THEME,
      {
        loadUsed: async () => [],
        recordUse,
        buildImage,
        storeImage,
        fetchImpl: fakeFetch({ [PHOTO_URL]: bytesA }),
      },
      "emotional",
    );

    expect(buildImage).toHaveBeenCalledWith(bytesA, [], { width: 1080, height: 1080 });
  });

  it("retorna null quando a foto já foi usada", async () => {
    const storeImage = vi.fn();

    const result = await generatePostArt(THEME, {
      loadUsed: async () => [{ key: contentHash(bytesA), usedAtMs: 0 }],
      recordUse,
      buildImage,
      storeImage,
      fetchImpl: fakeFetch({ [PHOTO_URL]: bytesA }),
    });

    expect(result).toBeNull();
    expect(storeImage).not.toHaveBeenCalled();
  });

  it("retorna null quando o download da foto falha", async () => {
    const result = await generatePostArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      buildImage,
      fetchImpl: fakeFetch({}),
    });

    expect(result).toBeNull();
    expect(recordUse).not.toHaveBeenCalled();
  });

  it("monta o reel com 1 frame (foto + cards) e registra o hash", async () => {
    const renderReel = vi.fn(async () => Buffer.from("mp4-bytes"));
    const storeVideo = vi.fn(async () => "https://storage/reel.mp4");

    const result = await generateReelArt(THEME, {
      loadUsed: async () => [],
      recordUse,
      buildImage,
      renderReel,
      storeVideo,
      fetchImpl: fakeFetch({ [PHOTO_URL]: bytesA }),
    });

    expect(result).toEqual({ url: "https://storage/reel.mp4" });
    expect(buildImage).toHaveBeenCalledWith(bytesA, ["Buffet infantil", "Decoração"], {
      width: 1080,
      height: 1920,
    });
    expect(renderReel).toHaveBeenCalledWith([bytesA]);
    expect(storeVideo).toHaveBeenCalledWith(Buffer.from("mp4-bytes"));
    expect(recordUse).toHaveBeenCalledTimes(1);
  });
});

describe("argumentos do ffmpeg do reel", () => {
  it("constrói o slideshow com zoom e concat", () => {
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
