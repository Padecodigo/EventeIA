import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tema Terra Rosé (layout Jardim)", () => {
  it("usa a paleta Jardim nos tokens", () => {
    const tw = read("tailwind.config.ts");
    for (const hex of ["#3B2420", "#A3485A", "#E8A587", "#F6E1D8", "#FBF6F2", "#F3E6DD", "#C9734F"]) expect(tw).toContain(hex);
    for (const old of ["#2B1E1A", "#13302B", "#0F766E"]) expect(tw).not.toContain(old);
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
