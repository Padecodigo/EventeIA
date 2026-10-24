import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "app/dev/estilos/page.tsx"), "utf8");

describe("prévia de estilos (dev only)", () => {
  it("responde 404 em produção e não é indexada", () => {
    expect(src).toMatch(/NODE_ENV === "production"\) notFound\(\)/);
    expect(src).toContain("index: false");
  });
  it("define exatamente 3 opções com nome, paleta e headline", () => {
    expect(src.match(/^\s+id: [123],$/gm)).toHaveLength(3);
    expect(src.match(/headline: "/g)).toHaveLength(3);
  });
  it("evita fontes, cores e frase vetadas", () => {
    for (const banned of ["Nunito", "Plus_Jakarta", "Caveat", "Curta a festa", "#2B1E1A"]) expect(src).not.toContain(banned);
  });
  it("usa a foto de festa de formatura e nenhuma imagem em /eventos/", () => {
    expect(src).toContain("/img/eventos/festa-formatura.jpg");
    expect(src).not.toMatch(/src: "\/eventos\//);
  });
});
