import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { applyFilmLook, FILM_LOOK } from "@/lib/marketing/film-look";

describe("film look", () => {
  it("regrava a cena em JPEG com as mesmas dimensões", async () => {
    const source = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 180, g: 90, b: 70 } },
    })
      .png()
      .toBuffer();

    const graded = await applyFilmLook(source);
    const meta = await sharp(graded).metadata();

    expect(graded[0]).toBe(0xff);
    expect(graded[1]).toBe(0xd8);
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(24);
    expect(meta.format).toBe("jpeg");
    expect(FILM_LOOK.jpegQuality).toBe(86);
    expect(FILM_LOOK.saturation).toBeLessThan(1);
    expect(FILM_LOOK.warmth[0]).toBeGreaterThan(FILM_LOOK.warmth[2]);
    expect(FILM_LOOK.grainSigma).toBeGreaterThan(0);
    expect(FILM_LOOK.vignetteOpacity).toBeGreaterThan(0);
    expect(FILM_LOOK.softnessSigma).toBeGreaterThan(0);
  });
});
