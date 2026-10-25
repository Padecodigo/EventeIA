import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}
const SRC = [...files("app"), ...files("components")].map((f) => [f, readFileSync(f, "utf8")] as const);
const classNames = (src: string) => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);

describe("regras de responsividade (regressão do scroll horizontal no celular)", () => {
  it("todo grid com colunas responsivas tem coluna base (grid-cols-1) para não alargar a página", () => {
    const bad: string[] = [];
    for (const [f, src] of SRC)
      for (const c of classNames(src)) {
        const tokens = c.split(/\s+/);
        if (tokens.includes("grid") && tokens.some((t) => /^(sm|md|lg|xl|2xl):grid-cols-/.test(t)) && !tokens.some((t) => /^grid-cols-/.test(t)))
          bad.push(`${f}: ${c}`);
      }
    expect(bad).toEqual([]);
  });
  it("tabelas do admin ficam dentro de um contêiner com overflow-x-auto", () => {
    const bad: string[] = [];
    for (const [f, src] of SRC.filter(([f]) => f.startsWith("app/admin")))
      if (src.includes("<table") && !src.includes("overflow-x-auto")) bad.push(f);
    expect(bad).toEqual([]);
  });
});
