import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tema Jardim", () => {
  it("usa a paleta Jardim nos tokens", () => {
    const tw = read("tailwind.config.ts");
    for (const hex of ["#13302B", "#0F766E", "#FF9466", "#FFE7DC", "#F6FAF7", "#E3F1EA"]) expect(tw).toContain(hex);
    expect(tw).not.toContain("#2B1E1A");
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
