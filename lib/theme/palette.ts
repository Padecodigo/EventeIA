/**
 * EventeIA — tokens que mudam com o tema (claro/escuro).
 * Valores da paleta "Areia & Coral" em lib/design/palette.ts (fonte única).
 * Espelhado em app/globals.css (variáveis --tr-*, canais RGB). Teste garante a paridade e o contraste AA.
 */
import { PALETTE, blend, contrastRatio, hexToRgb } from "@/lib/design/palette";

export { blend, contrastRatio, hexToRgb };

export const THEME_TOKENS = ["vinho", "areia-quente", "areia-secundaria", "off-white", "champagne-claro", "primaria", "primaria-escura", "semantic-error"] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];

export const LIGHT: Record<ThemeToken, string> = {
  vinho: PALETTE.ink,
  "areia-quente": PALETTE.areiaQuente,
  "areia-secundaria": PALETTE.areiaSecundaria,
  "off-white": PALETTE.offWhite,
  "champagne-claro": PALETTE.champagneClaro,
  primaria: PALETTE.primaria,
  "primaria-escura": PALETTE.primariaEscura,
  "semantic-error": "#B3261E",
};

/** Escuro: charcoal profundo de fundo, texto areia-claro, coral mais luminoso para acentos. */
export const DARK: Record<ThemeToken, string> = {
  vinho: "#F6E9E3",
  "areia-quente": "#1C1311",
  "areia-secundaria": "#2C1F1B",
  "off-white": "#261A17",
  "champagne-claro": "#3D2924",
  primaria: "#F2A878",
  "primaria-escura": "#F6BE96",
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
