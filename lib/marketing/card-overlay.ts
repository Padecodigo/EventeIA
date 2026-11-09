import "server-only";

import sharp from "sharp";

/**
 * Composição de post publicitário sobre foto real:
 *   - banner no TOPO (degradê) com marca "EVENTEIA" + headline;
 *   - cards "Orçamento recebido" no RODAPÉ (com sombra sutil).
 * Tudo desenhado via SVG/sharp (não pela IA).
 */

const MAROON = "#7a1e2b";
const TEXT_DARK = "#2B2724";
const TEXT_MUTED = "#5f5650";
const ACCENT = "#F0A070"; // coral (acento da marca)
const BANNER_TEXT = "#ffffff";

/** As 2 categorias mais relevantes por tema (texto dos cards). */
export const RECEIPT_CATEGORIES_BY_THEME: Record<string, readonly [string, string]> = {
  infantil: ["Buffet infantil", "Decoração"],
  aniversario: ["Buffet", "Bolo"],
  casamento: ["Buffet", "Decoração"],
  "15-anos": ["Buffet", "DJ"],
  formatura: ["Espaço", "DJ"],
  corporativo: ["Coffee break", "Espaço"],
};

/** Headline de banner por tema (2 linhas, emocional e direcionada). */
export const HEADLINES_BY_THEME: Record<string, readonly [string, string]> = {
  infantil: ["A festa que ele vai lembrar.", "Você presente em cada momento."],
  aniversario: ["Celebrar quem você ama,", "sem correria no grande dia."],
  casamento: ["O orçamento claro para você", "viver o amor — não a planilha."],
  "15-anos": ["A noite que marca a vida dela.", "Organizada com clareza."],
  formatura: ["A conquista é sua.", "A conta, a gente deixa clara."],
  corporativo: ["Um evento que une sua equipe,", "com orçamento no menor preço."],
};

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Banner (topo): degradê + marca + headline. */
export function buildBannerSvg(headline: readonly string[], width: number, height: number): string {
  const bandH = Math.round(height * 0.3);
  const padX = Math.round(width * 0.055);
  const brandSize = Math.max(16, Math.round(width * 0.02));
  const font = Math.max(32, Math.round(width * 0.04));
  const lineH = Math.round(font * 1.3);
  const headlineTop = Math.round(brandSize * 2.2);
  const lines = headline
    .map(
      (line, i) =>
        `<text x="${padX}" y="${headlineTop + i * lineH}" font-family="Liberation Sans, Arial, sans-serif" font-size="${font}" font-weight="bold" fill="${BANNER_TEXT}">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="banner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(26,22,20,0.88)"/>
      <stop offset="1" stop-color="rgba(26,22,20,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${bandH}" fill="url(#banner)"/>
  <text x="${padX}" y="${Math.round(brandSize * 1.7)}" font-family="Liberation Sans, Arial, sans-serif" font-size="${brandSize}" font-weight="bold" fill="${ACCENT}">EVENTEIA</text>
  ${lines}
</svg>`;
}

/** Cards "Orçamento recebido" no rodapé (puro, testável). */
export function buildReceiptCardSvg(
  categories: readonly string[],
  width: number,
  height: number,
): string {
  if (categories.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  }

  const cardW = Math.round(width * 0.44);
  const cardH = Math.max(92, Math.round(cardW * 0.23));
  const gap = 14;
  const marginX = Math.round(width * 0.05);
  const marginBottom = Math.round(height * 0.055);
  const totalH = categories.length * cardH + (categories.length - 1) * gap;
  const startY = height - marginBottom - totalH;
  const startX = width - marginX - cardW;
  const iconR = Math.round(cardH * 0.16);
  const fontTitle = Math.max(20, Math.round(width * 0.024));
  const fontCat = Math.max(17, Math.round(width * 0.02));

  const cards = categories
    .map((cat, i) => {
      const y = startY + i * (cardH + gap);
      const iconCx = startX + iconR + 24;
      const iconCy = y + cardH / 2;
      const textX = iconCx + iconR + 14;
      const titleY = y + cardH * 0.42;
      const catY = y + cardH * 0.72;
      return [
        // sombra sutil
        `<rect x="${startX + 4}" y="${y + 5}" width="${cardW}" height="${cardH}" rx="20" fill="rgba(0,0,0,0.18)"/>`,
        `<rect x="${startX}" y="${y}" width="${cardW}" height="${cardH}" rx="20" fill="#ffffff" fill-opacity="0.98" stroke="#ebe5db" stroke-width="1.5"/>`,
        `<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="${MAROON}"/>`,
        `<path d="M ${iconCx - iconR * 0.45} ${iconCy} l ${iconR * 0.32} ${iconR * 0.34} l ${iconR * 0.66} -${iconR * 0.74}" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<text x="${textX}" y="${titleY}" font-family="Liberation Sans, Arial, sans-serif" font-size="${fontTitle}" font-weight="bold" fill="${TEXT_DARK}">Orçamento recebido</text>`,
        `<text x="${textX}" y="${catY}" font-family="Liberation Sans, Arial, sans-serif" font-size="${fontCat}" fill="${TEXT_MUTED}">${escapeXml(cat)}</text>`,
      ].join("");
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cards}</svg>`;
}

export interface ComposeAdInput {
  headline: readonly string[];
  categories: readonly string[];
  width?: number;
  height?: number;
}

/** Redimensiona a foto e compõe banner (topo) + cards (rodapé). */
export async function composeAd(
  imageBytes: Buffer,
  input: ComposeAdInput,
): Promise<Buffer> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const banner = Buffer.from(buildBannerSvg(input.headline, width, height));
  const cards = Buffer.from(buildReceiptCardSvg(input.categories, width, height));
  return sharp(imageBytes)
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([
      { input: banner, top: 0, left: 0 },
      { input: cards, top: 0, left: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}
