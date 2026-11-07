import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regressão: `quality` fora de `images.qualities` faz o otimizador do Next
 * responder 400 e a imagem nascer quebrada em produção (aconteceu com q=72).
 */
const ROOT = process.cwd();
const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
const allowed = [...config.matchAll(/qualities:\s*\[([^\]]+)\]/g)]
  .flatMap((m) => m[1].split(","))
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("next/image quality", () => {
  it("configura ao menos uma qualidade", () => {
    expect(allowed.length).toBeGreaterThan(0);
  });

  it("todo quality={n} do código está em images.qualities", () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))]) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/quality=\{(\d+)\}/g)) {
        const value = Number(m[1]);
        if (!allowed.includes(value)) offenders.push(`${file.replace(`${ROOT}/`, "")}: q=${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
