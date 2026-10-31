/**
 * EventeIA — paleta "Areia & Coral".
 * Fonte única da verdade dos valores de cor do produto; consumida por
 * tailwind.config.ts, app/globals.css (via lib/theme/palette.ts) e app/og/route.tsx.
 */
export const PALETTE = {
  /** Texto principal / tinta (também vinho/noite históricos). */
  ink: "#2B2724",
  /** Fundo padrão de página (areia-quente). */
  areiaQuente: "#F7F2EA",
  /** Superfícies alternadas / faixas (areia-secundaria, verde-claro, surface.muted). */
  areiaSecundaria: "#EEE5D6",
  /** Cards e campos (off-white/canvas). */
  offWhite: "#FFFFFF",
  /** CTA principal (primaria). Texto sempre charcoal. */
  primaria: "#F0A070",
  /** Hover do CTA principal (primaria-escura). */
  primariaEscura: "#E88B55",
  /** Texto charcoal sobre primaria/champagne (contraste 7,03:1). */
  onPrimary: "#2B2724",
  /** Acento de texto sobre fundos claros (links, badges, eyebrows). */
  coralEscuro: "#A4481F",
  /** Acento preenchido (champagne/coral). */
  champagne: "#F0A070",
  /** Acento suave (champagne-claro/accentSoft/text.soft). */
  champagneClaro: "#FBE3D3",
  /** Secundário frio (botões secundários, badges, foco). */
  teal: "#38706A",
  /** Fundo suave do secundário frio. */
  tealSoft: "#D7E7E3",
  /** Decorativo (terracota). */
  terracota: "#D9784A",
  /** Dourado do monograma — uso restrito ao logo. */
  dourado: "#BF986B",
  /** Seções editoriais escuras (charcoal). */
  surfaceDark: "#2B2724",
  sol: "#FFC94D",
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Canais RGB separados por espaço (formato das variáveis CSS --tr-*). */
export function rgbChannels(hex: string): string {
  return hexToRgb(hex).join(" ");
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

/** Razão de contraste WCAG 2.x entre duas cores hexadecimais. */
export function contrastRatio(a: string | [number, number, number], b: string | [number, number, number]): number {
  const la = luminance(typeof a === "string" ? hexToRgb(a) : a);
  const lb = luminance(typeof b === "string" ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
