import { describe, expect, it } from "vitest";

import {
  contentHash,
  pickFirstUnusedRecently,
  staticMediaKey,
  STATIC_REUSE_WINDOW_MS,
  type MediaUse,
} from "@/lib/marketing/media-dedup";

describe("deduplicação de mídia do autopilot", () => {
  it("gera hash SHA-256 hex determinístico do conteúdo", () => {
    const a = Buffer.from("mesma-imagem");
    expect(contentHash(a)).toBe(contentHash(a));
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash(a)).not.toBe(contentHash(Buffer.from("outra-imagem")));
  });

  it("marca a chave estática com prefixo próprio", () => {
    expect(staticMediaKey("/brand/posts/infantil.jpg")).toBe("static:/brand/posts/infantil.jpg");
  });

  it("escolhe o primeiro candidato ainda não usado na janela", () => {
    const uses: MediaUse[] = [{ key: "static:/a.jpg", usedAtMs: 10_000 }];
    const picked = pickFirstUnusedRecently(
      ["/a.jpg", "/b.jpg"],
      uses,
      (p) => staticMediaKey(p),
      STATIC_REUSE_WINDOW_MS,
      20_000,
    );
    expect(picked).toBe("/b.jpg");
  });

  it("devolve null quando todos os candidatos foram usados recentemente", () => {
    const uses: MediaUse[] = [
      { key: "static:/a.jpg", usedAtMs: 10_000 },
      { key: "static:/b.jpg", usedAtMs: 11_000 },
    ];
    const picked = pickFirstUnusedRecently(
      ["/a.jpg", "/b.jpg"],
      uses,
      (p) => staticMediaKey(p),
      STATIC_REUSE_WINDOW_MS,
      20_000,
    );
    expect(picked).toBeNull();
  });

  it("permite reutilizar um asset usado fora da janela recente", () => {
    const now = 24 * 60 * 60 * 1000; // 1 dia em ms
    const uses: MediaUse[] = [{ key: "static:/a.jpg", usedAtMs: 0 }];
    const picked = pickFirstUnusedRecently(
      ["/a.jpg"],
      uses,
      (p) => staticMediaKey(p),
      STATIC_REUSE_WINDOW_MS,
      now,
    );
    expect(picked).toBe("/a.jpg");
  });
});
