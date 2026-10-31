import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { wcagContrast } from "@/lib/ui/contrast";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tema Maison Vinho & Ouro", () => {
  it("usa a paleta Maison nos tokens", () => {
    const tw = read("tailwind.config.ts");
    for (const hex of ["#6B1E2E", "#4A1420", "#B8925A", "#E9D9B8", "#FAF6EF", "#F1E9DC", "#2A1A1D", "#6E5F5C", "#2F6B4F"]) {
      expect(tw).toContain(hex);
    }
    for (const old of ["#3B2420", "#A3485A", "#E8A587", "#F6E1D8", "#FBF6F2", "#F3E6DD", "#C9734F"]) {
      expect(tw).not.toContain(old);
    }
  });

  it("removeu as cores legadas sol, lilas e menta", () => {
    const tw = read("tailwind.config.ts");
    expect(tw).not.toMatch(/\b(sol|lilas|menta):\s/);
  });

  it("CTA primário é vinho sólido com texto branco e passa AA", () => {
    expect(read("app/globals.css")).toMatch(/\.btn-primary[\s\S]*?bg-primaria[\s\S]*?text-white/);
    expect(wcagContrast("#FFFFFF", "#6B1E2E")).toBeGreaterThanOrEqual(4.5);
  });

  it("texto muted sobre marfim atende AA", () => {
    expect(wcagContrast("#6E5F5C", "#FAF6EF")).toBeGreaterThanOrEqual(4.5);
  });

  it("carrega Fraunces + Figtree e removeu as fontes antigas", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/Fraunces/);
    expect(layout).toMatch(/Figtree/);
    for (const old of ["Plus_Jakarta_Sans", "Caveat", "Inter"]) expect(layout).not.toContain(old);
  });

  it("hero usa a headline nova", () => {
    expect(read("app/(marketing)/page.tsx")).toContain("Menos ligações,");
  });

  it("auth e 404 compartilham header e rodapé do site", () => {
    for (const p of ["app/(auth)/layout.tsx", "app/not-found.tsx", "app/(marketing)/layout.tsx"]) {
      expect(read(p)).toContain("SiteFooter");
    }
    expect(existsSync(join(process.cwd(), "app/error.tsx"))).toBe(true);
  });
});
