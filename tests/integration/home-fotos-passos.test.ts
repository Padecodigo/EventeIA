import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PHOTOS = [
  { file: "passo-1-planejando-no-celular.webp", source: "https://www.pexels.com/photo/27176011/" },
  { file: "passo-2-buffet-orcamento.webp", source: "https://www.pexels.com/photo/16884249/" },
  { file: "passo-3-festa-celebrando.webp", source: "https://www.pexels.com/photo/7180623/" },
];

describe("fotos dos 3 passos da home (arquivos locais + créditos)", () => {
  const page = readFileSync("app/(marketing)/page.tsx", "utf8");
  const credits = readFileSync("public/img/eventos/CREDITOS.md", "utf8");

  for (const p of PHOTOS) {
    it(`${p.file}: WebP local, leve, referenciado e creditado`, () => {
      const path = `public/img/eventos/${p.file}`;
      const buf = readFileSync(path);
      expect(buf.subarray(0, 4).toString()).toBe("RIFF");
      expect(buf.subarray(8, 12).toString()).toBe("WEBP");
      expect(statSync(path).size).toBeLessThan(160_000);
      expect(page).toContain(`/img/eventos/${p.file}`);
      expect(credits).toContain(p.file);
      expect(credits).toContain(p.source);
    });
  }

  it("não usa hotlink de bancos de imagem", () => {
    expect(page).not.toMatch(/images\.(pexels|unsplash)\.com|pixabay\.com/);
  });
});
