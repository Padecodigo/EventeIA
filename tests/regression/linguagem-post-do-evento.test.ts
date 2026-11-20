import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Regra do Allan (20/11/2026): "post do evento", nunca "post isca"; e nunca "IA" para o produto.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe("linguagem do produto nas telas", () => {
  const sources = [...files("app"), ...files("components")];

  it("nenhuma tela usa o termo antigo do post do evento", () => {
    const offenders = sources.filter((f) => /\biscas?\b/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("o título de /admin/prospeccao fala em posts do evento", () => {
    expect(readFileSync("app/admin/prospeccao/page.tsx", "utf8")).toContain("Prospecção — posts do evento");
  });
});
