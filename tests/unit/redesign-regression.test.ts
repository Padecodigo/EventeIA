import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Regressões do redesign P0: rota removida, títulos únicos e título do 404. */
const ROOT = process.cwd();
const page = readFileSync(join(ROOT, "app/(marketing)/page.tsx"), "utf8");
const notFound = readFileSync(join(ROOT, "app/not-found.tsx"), "utf8");

function trustTitles(): string[] {
  const start = page.indexOf("const TRUST");
  const end = page.indexOf("] as const;", start);
  const block = page.slice(start, end);
  return [...block.matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("redesign P0 — regressões da home e do 404", () => {
  it("app/preview não existe mais (rota removida)", () => {
    expect(existsSync(join(ROOT, "app/preview"))).toBe(false);
    expect(existsSync(join(ROOT, "app/preview/page.tsx"))).toBe(false);
  });

  it("títulos da seção TRUST da home são únicos", () => {
    const titles = trustTitles();
    expect(titles).toHaveLength(4);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("app/not-found.tsx exporta metadata com título sem 'EventeIA' (o template adiciona)", () => {
    const match = notFound.match(/export const metadata\s*=\s*\{\s*title:\s*["']([^"']+)["']/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toContain("EventeIA");
  });
});
