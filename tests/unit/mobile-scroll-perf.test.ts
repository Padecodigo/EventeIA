import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Regressão do scroll mobile (jank): regras estáticas sobre app/ e components/. */
const ROOT = join(__dirname, "..", "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].map((p) => ({
  p,
  src: readFileSync(p, "utf8"),
}));
const tsx = files.filter((f) => f.p.endsWith(".tsx"));

describe("performance de scroll no mobile", () => {
  it("scroll/touch/wheel listeners são passive", () => {
    for (const { p, src } of files) {
      for (const m of src.matchAll(
        /addEventListener\(\s*["'](scroll|touchstart|touchmove|wheel)["'][^)]*\)/g,
      )) {
        expect(m[0], p).toMatch(/passive:\s*true/);
      }
    }
  });

  it("sem libs de smooth-scroll, scroll-behavior smooth global ou background-attachment fixed", () => {
    for (const { p, src } of files) {
      expect(src, p).not.toMatch(/from ["'](lenis|@studio-freight\/lenis|locomotive-scroll)["']/);
      expect(src, p).not.toMatch(/background-attachment:\s*fixed|\bbg-fixed\b/);
      expect(src, p).not.toMatch(/scroll-behavior:\s*smooth|\bscroll-smooth\b/);
    }
  });

  it("imagens usam next/image (sem <img> cru) e imagens fluidas declaram sizes", () => {
    for (const { p, src } of tsx) {
      expect(src, p).not.toMatch(/<img\s/);
      for (const m of src.matchAll(/<Image\b[\s\S]*?\/>/g)) {
        const tag = m[0];
        if (/\bfill\b|w-full/.test(tag)) expect(tag, p).toMatch(/sizes=/);
      }
    }
  });

  it("backdrop-blur só a partir de md: (caro na GPU de celulares durante o scroll)", () => {
    for (const { p, src } of files) {
      for (const m of src.matchAll(/(\S*)backdrop-blur/g))
        expect(m[0], p).toMatch(/^(md|lg|xl|sm:md):|^md:/);
    }
  });

  it("keyframes em loop da home só animam opacity/transform (composited)", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    for (const m of css.matchAll(/@keyframes\s+(ev-[\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
      const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
      for (const prop of props)
        expect(["opacity", "transform"], `${m[1]}: ${prop}`).toContain(prop);
    }
  });
});

describe("home: animação 'como funciona' fora da viewport", () => {
  it("fica dentro de .ev-skip-offscreen (content-visibility: auto)", () => {
    const page = readFileSync(join(ROOT, "app", "(marketing)", "page.tsx"), "utf8");
    expect(page).toMatch(/className="ev-skip-offscreen">\s*<HowItWorksAnimation \/>/);
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.ev-skip-offscreen\s*\{[^}]*content-visibility:\s*auto/);
  });
});

describe("home: CLS do hero", () => {
  it("blob decorativo do hero não ancora no bottom no mobile (render parcial em streaming movia-o: CLS 0,6)", () => {
    const page = readFileSync(join(ROOT, "app", "(marketing)", "page.tsx"), "utf8");
    for (const m of page.matchAll(/className="[^"]*(?:^|\s)bottom-\[-25%\][^"]*"/g))
      expect(m[0]).toMatch(/lg:bottom-\[-25%\]/);
    expect(page).toMatch(/-left-40 top-\[600px\]/);
  });
});
