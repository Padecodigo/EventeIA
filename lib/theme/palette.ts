/**
 * Maison Vinho & Ouro — tokens que mudam com o tema (claro/escuro).
 * Espelhado em app/globals.css (variáveis --tr-*, canais RGB). Teste garante a paridade e o contraste AA.
 */
export const THEME_TOKENS = ["vinho", "areia-quente", "areia-secundaria", "off-white", "champagne-claro", "primaria", "primaria-escura", "semantic-error"] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];

export const LIGHT: Record<ThemeToken, string> = {
  vinho: "#6B1E2E",
  "areia-quente": "#FAF6EF",
  "areia-secundaria": "#F1E9DC",
  "off-white": "#FFFFFF",
  "champagne-claro": "#E9D9B8",
  primaria: "#6B1E2E",
  "primaria-escura": "#4A1420",
  "semantic-error": "#B3261E",
};

/** Escuro: fundo ink profundo, texto linho claro, ouro mais luminoso para acentos. */
export const DARK: Record<ThemeToken, string> = {
  vinho: "#F1E9DC",
  "areia-quente": "#2A1A1D",
  "areia-secundaria": "#3A2A2D",
  "off-white": "#352628",
  "champagne-claro": "#4A3A2C",
  primaria: "#E9D9B8",
  "primaria-escura": "#B8925A",
  "semantic-error": "#FF8A80",
};

export type ThemePreference = "light" | "dark" | "system";
export const THEME_COOKIE = "eventeia-theme";

export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Classe aplicada no contêiner: "dark" força; "theme-system" segue prefers-color-scheme. */
export function themeClass(pref: ThemePreference): string {
  return pref === "dark" ? "dark" : pref === "system" ? "theme-system" : "";
}

export function nextPreference(pref: ThemePreference): ThemePreference {
  return pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Mistura `fg` com opacidade `alpha` sobre `bg` (ex.: text-vinho/70). */
export function blend(fg: string, bg: string, alpha: number): [number, number, number] {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return [0, 1, 2].map((i) => Math.round(f[i] * alpha + b[i] * (1 - alpha))) as [number, number, number];
}

/** Razão de contraste WCAG 2.x. */
export function contrastRatio(a: string | [number, number, number], b: string | [number, number, number]): number {
  const la = luminance(typeof a === "string" ? hexToRgb(a) : a);
  const lb = luminance(typeof b === "string" ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
