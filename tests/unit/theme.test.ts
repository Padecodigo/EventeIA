import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DARK, LIGHT, THEME_TOKENS, blend, contrastRatio, hexToRgb, nextPreference, parseThemePreference, themeClass } from "@/lib/theme/palette";

const AA = 4.5;

describe("paleta Terra Rosé escura — WCAG AA", () => {
  const surfaces = [DARK["areia-quente"], DARK["off-white"], DARK["areia-secundaria"]];

  it("texto principal e secundário (70%) passam AA em todas as superfícies", () => {
    for (const bg of surfaces) {
      expect(contrastRatio(DARK.vinho, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(blend(DARK.vinho, bg, 0.7), bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("acentos (rosé, erro) passam AA nos cartões e no fundo", () => {
    for (const bg of [DARK["areia-quente"], DARK["off-white"]]) {
      expect(contrastRatio(DARK.primaria, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(DARK["semantic-error"], bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("botão invertido (bg-vinho + text-off-white) passa AA nos dois temas", () => {
    expect(contrastRatio(DARK["off-white"], DARK.vinho)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(LIGHT["off-white"], LIGHT.vinho)).toBeGreaterThanOrEqual(AA);
  });

  it("tema claro mantém AA do texto 70%", () => {
    expect(contrastRatio(blend(LIGHT.vinho, LIGHT["off-white"], 0.7), LIGHT["off-white"])).toBeGreaterThanOrEqual(AA);
  });
});

describe("globals.css espelha a paleta", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const block = (selector: string): string => {
    const i = css.indexOf(`${selector} {`);
    return css.slice(i, css.indexOf("}", i));
  };

  it.each([[":root", LIGHT], [".dark", DARK], [".theme-system", DARK]] as const)("%s", (selector, pal) => {
    const b = block(selector);
    for (const t of THEME_TOKENS) {
      expect(b, t).toContain(`--tr-${t}: ${hexToRgb(pal[t]).join(" ")};`);
    }
  });

  it("modo sistema respeita prefers-color-scheme", () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*\.theme-system/);
  });
});

describe("preferência de tema", () => {
  it("valida cookie e cicla sistema → escuro → claro", () => {
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("hack")).toBe("system");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(nextPreference("system")).toBe("dark");
    expect(nextPreference("dark")).toBe("light");
    expect(nextPreference("light")).toBe("system");
    expect(themeClass("dark")).toBe("dark");
    expect(themeClass("system")).toBe("theme-system");
    expect(themeClass("light")).toBe("");
  });
});
