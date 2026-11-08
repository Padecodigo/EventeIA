import "server-only";

import sharp from "sharp";

/**
 * Composição de post publicitário sobre foto real:
 *   - faixa de banner no TOPO com a headline (texto grande, nítido);
 *   - cards "Orçamento recebido" no RODAPÉ (texto nítido).
 * Tudo desenhado via SVG/sharp (não pela IA).
 */

const CARD_BG = "#ffffff";
const CARD_BORDER = "#e6e0d6";
const MAROON = "#7a1e2b";
const TEXT_DARK = "#2B2724";
const TEXT_MUTED = "#5f5650";
const BANNER_BG = "rgba(43, 39, 36, 0.78)";
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

/** Faixa de banner + headline no topo. */
export function buildBannerSvg(headline: readonly string[], width: number, height: number): string {
  const bandH = Math.round(height * 0.24);
  const font = Math.max(30, Math.round(width * 0.044));
  const lineH = Math.round(font * 1.22);
  const textStartY = Math.round(bandH * 0.4);
  const lines = headline
    .map(
      (line, i) =>
        `<text x="${Math.round(width * 0.05)}" y="${textStartY + i * lineH}" font-family="Liberation Sans, Arial, sans-serif" font-size="${font}" font-weight="bold" fill="${BANNER_TEXT}">${escapeXml(line)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${bandH}" fill="${BANNER_BG}"/>${lines}</svg>`;
}

/** Cards "Orçamento recebido" no rodapé (puro, testável). */
export function buildReceiptCardSvg(
  categories: readonly string[],
  width: number,
  height: number,
): string {
  if (categories.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;

  const cardW = Math.round(width * 0.46);
  const cardH = Math.max(96, Math.round(cardW * 0.24));
  const gap = 16;
  const marginX = Math.round(width * 0.05);
  const marginBottom = Math.round(height * 0.06);
  const totalH = categories.length * cardH + (categories.length - 1) * gap;
  const startY = height - marginBottom - totalH;
  const startX = width - marginX - cardW;
  const iconR = Math.round(cardH * 0.17);
  const fontTitle = Math.max(22, Math.round(width * 0.026));
  const fontCat = Math.max(18, Math.round(width * 0.022));

  const cards = categories
    .map((cat, i) => {
      const y = startY + i * (cardH + gap);
      const iconCx = startX + iconR + 26;
      const iconCy = y + cardH / 2;
      const textX = iconCx + iconR + 16;
      const titleY = y + cardH * 0.42;
      const catY = y + cardH * 0.74;
      return [
        `<rect x="${startX}" y="${y}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD_BG}" fill-opacity="0.97" stroke="${CARD_BORDER}" stroke-width="2"/>`,
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

/**
 * Redimensiona a foto e compõe banner (topo) + cards (rodapé) por cima.
 */
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
