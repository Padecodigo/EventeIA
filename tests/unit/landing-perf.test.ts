import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de TBT/SEO: as páginas públicas são Server Components de ponta a ponta
 * (conteúdo no HTML, sem JS de cliente próprio) e não disparam prefetch em massa de links.
 */
const ROOT = process.cwd();
const ENTRIES = [
  "app/(marketing)/layout.tsx",
  "app/(marketing)/page.tsx",
  "app/(marketing)/como-funciona/page.tsx",
  "app/(marketing)/planos/page.tsx",
  "app/(marketing)/para-planners/page.tsx",
];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

function localGraph(entry: string, seen = new Set<string>()): Set<string> {
  const file = join(ROOT, entry);
  const walk = (f: string): void => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)) {
      const next = resolveImport(f, m[1] ?? "");
      if (next) walk(next);
    }
  };
  walk(file);
  return seen;
}

describe("páginas públicas", () => {
  it.each(ENTRIES)("%s não importa componentes \"use client\" próprios", (entry) => {
    const clients = [...localGraph(entry)].filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clients.map((f) => f.replace(`${ROOT}/`, ""))).toEqual([]);
  });

  it.each([...ENTRIES, "components/site-header.tsx", "components/site-footer.tsx"])("%s: todo <Link> tem prefetch={false}", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const links = [...src.matchAll(/<Link\b[\s\S]*?>/g)].map((m) => m[0]);
    expect(links.filter((l) => !l.includes("prefetch={false}"))).toEqual([]);
  });
});
