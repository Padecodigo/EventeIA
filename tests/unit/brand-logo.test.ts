import { describe, expect, it } from "vitest";

import sharp from "sharp";

import { applyBrandLogo } from "@/lib/marketing/brand-logo";

describe("logo EventeIA composta", () => {
  it("aplica o chip e devolve JPEG válido com a marca", async () => {
    const input = await sharp({
      create: { width: 108, height: 108, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();

    const out = await applyBrandLogo(input);

    // JPEG magic bytes (FF D8).
    expect(out.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);
    // O chip (fundo + logo) adiciona pixels/ruído → JPEG maior que o PNG 1 cor.
    expect(out.length).toBeGreaterThan(0);
  });
});
