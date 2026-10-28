import { describe, expect, it } from "vitest";

import { extractNvidiaImage, normalizeImageValue, sniffMime } from "@/lib/nvidia/pure";

describe("resposta da NVIDIA NIM", () => {
  it("extrai base64 de artifacts", () => {
    expect(extractNvidiaImage({ artifacts: [{ base64: "abc" }] })).toEqual({ base64: "abc", url: null, mime: null });
  });

  it("extrai data URI com mime", () => {
    expect(normalizeImageValue("data:image/jpeg;base64,QQ==")).toEqual({ base64: "QQ==", url: null, mime: "image/jpeg" });
  });

  it("extrai URL", () => {
    expect(extractNvidiaImage({ image: "https://cdn/x.png" })).toEqual({ base64: null, url: "https://cdn/x.png", mime: null });
  });

  it("devolve null sem imagem", () => {
    expect(extractNvidiaImage({ ok: true })).toBeNull();
    expect(extractNvidiaImage("texto")).toBeNull();
  });

  it("detecta o mime pelos bytes", () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(Buffer.from("nada"))).toBeNull();
  });
});
