import "server-only";

import sharp from "sharp";

import { trimmedBrandMonogram } from "@/lib/marketing/brand-logo";

/**
 * Composição de post publicitário sobre a cena (sharp, sem texto da IA):
 *   - com cards: anúncio claro (título serifado vinho, pílula, cartões);
 *   - sem cards: quadro editorial (degradê vinho, selo dourado, título serifado claro).
 * Sem `letter-spacing`: o librsvg duplica o glifo quando o atributo está presente.
 */

const WINE = "#3D1B28";
const WINE_DEEP = "#2A1119";
const GOLD = "#D4AF37";
const PAPER = "#FFFDFA";
const TEXT_DARK = "#2B2724";
const SERIF = "Liberation Serif, Times New Roman, serif";
const SANS = "Liberation Sans, Arial, sans-serif";

/** As 2 categorias mais relevantes por tema (texto dos cards). */
export const RECEIPT_CATEGORIES_BY_THEME: Record<string, readonly [string, string]> = {
  infantil: ["Buffet infantil", "Decoração"],
  aniversario: ["Buffet", "Bolo"],
  casamento: ["Buffet", "Decoração"],
  "15-anos": ["Buffet", "DJ"],
  formatura: ["Espaço", "DJ"],
  corporativo: ["Coffee break", "Espaço"],
};

/**
 * Copy do anúncio. Até duas linhas de título (serif) e, por último, o apoio:
 * frase completa, com inicial maiúscula. Três itens = título + título + apoio.
 */
export const HEADLINES_BY_THEME: Record<string, readonly string[]> = {
  infantil: ["A festa que ele", "vai lembrar.", "Você presente em cada momento."],
  aniversario: ["Celebrar quem", "você ama.", "Sem correria no grande dia."],
  casamento: ["O orçamento claro", "para viver o amor.", "Sem planilha no grande dia."],
  "15-anos": ["A noite que marca", "a vida dela.", "Tudo organizado com clareza."],
  formatura: ["A conquista é sua.", "A conta, a gente deixa clara."],
  corporativo: ["Um evento que", "une a equipe.", "Orçamento claro, no menor preço."],
};

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tamanho de fonte que cabe na largura útil (librsvg não quebra linha). */
function fitFont(text: string, width: number, preferred: number, min: number): number {
  const avail = width * 0.86;
  const estimated = text.length * preferred * 0.52;
  if (estimated <= avail) return preferred;
  return Math.max(min, Math.floor(avail / (text.length * 0.52)));
}

interface LogoBox {
  width: number;
  height: number;
}

/** Título (até 2 linhas) e apoio. Três ou mais itens: as duas primeiras são o título. */
function splitLifestyleCopy(headline: readonly string[]): { title: string[]; support: string } {
  const lines = headline.map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length >= 3) {
    return { title: lines.slice(0, 2), support: lines[lines.length - 1] ?? "" };
  }
  if (lines.length === 2) return { title: [lines[0] ?? ""], support: lines[1] ?? "" };
  return { title: lines, support: "" };
}

/** Fonte que cabe na largura útil, sem invadir a margem. */
function fitLine(text: string, contentWidth: number, preferred: number, min: number): number {
  if (text.length === 0) return preferred;
  const estimated = text.length * preferred * 0.56;
  if (estimated <= contentWidth) return preferred;
  return Math.max(min, Math.floor(contentWidth / (text.length * 0.56)));
}

/** Medidas do anúncio claro. O monograma entra depois, no mesmo retângulo. */
function lifestyleFrame(width: number, height: number, headline: readonly string[], logo: LogoBox) {
  const padX = Math.round(width * 0.07);
  const padTop = Math.max(56, Math.round(width * 0.06));
  const contentWidth = width - padX * 2;
  const copy = splitLifestyleCopy(headline);
  const longest = copy.title.reduce((max, line) => Math.max(max, line.length), 1);
  const titleSize = fitLine("x".repeat(longest), contentWidth, Math.round(width * 0.078), 48);
  const supportSize = fitLine(copy.support, contentWidth, Math.round(width * 0.028), 18);
  const word = Math.round(logo.height * 0.58);
  const textX = padX + logo.width + Math.round(width * 0.02);
  const wordBaseline = padTop + Math.round(logo.height * 0.72);
  const lineH = Math.round(titleSize * 1.16);
  const firstTitleY = padTop + logo.height + Math.round(titleSize * 0.95);
  const titleYs = copy.title.map((_, index) => firstTitleY + index * lineH);
  const lastTitleY = titleYs[titleYs.length - 1] ?? firstTitleY;
  const supportY = lastTitleY + Math.round(Math.max(supportSize, 20) * 1.85);
  const pillH = Math.max(50, Math.round(width * 0.05));
  const pillFont = Math.round(pillH * 0.38);
  const pillLabel = "eventeia.com.br";
  const pillW = Math.min(
    contentWidth,
    Math.round(pillLabel.length * pillFont * 0.56 + pillH * 1.15),
  );
  const anchorY = copy.support.length > 0 ? supportY : lastTitleY;
  const pillY = anchorY + Math.round(pillH * 0.55);
  return {
    padX,
    padTop,
    title: copy.title,
    titleYs,
    support: copy.support,
    titleSize,
    supportSize,
    word,
    textX,
    wordBaseline,
    supportY,
    pillH,
    pillFont,
    pillLabel,
    pillW,
    pillY,
    pillTextY: pillY + Math.round(pillH * 0.67),
  };
}

/** Anúncio claro: degradê de papel no topo, título serifado em até duas linhas e pílula. */
function buildLifestyleBanner(
  headline: readonly string[],
  width: number,
  height: number,
  logo: LogoBox,
): string {
  const frame = lifestyleFrame(width, height, headline, logo);
  const at = (px: number) => Math.min(0.92, px / Math.max(height, 1)).toFixed(3);
  const titles = frame.title
    .map(
      (line, index) =>
        `<text x="${frame.padX}" y="${frame.titleYs[index]}" font-family="${SERIF}" font-size="${frame.titleSize}" font-weight="bold" fill="${WINE}">${escapeXml(line)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,253,250,0.92)"/>
      <stop offset="${at(frame.titleYs[0] ?? frame.padTop)}" stop-color="rgba(255,253,250,0.82)"/>
      <stop offset="${at(frame.supportY)}" stop-color="rgba(255,253,250,0.62)"/>
      <stop offset="${at(frame.pillY + frame.pillH)}" stop-color="rgba(255,253,250,0.22)"/>
      <stop offset="${at(frame.pillY + frame.pillH + Math.round(height * 0.1))}" stop-color="rgba(255,253,250,0)"/>
      <stop offset="1" stop-color="rgba(255,253,250,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#wash)"/>
  <text x="${frame.textX}" y="${frame.wordBaseline}" font-family="${SERIF}" font-size="${frame.word}" font-weight="bold" fill="${WINE}">EventeIA</text>
  ${titles}
  ${frame.support.length > 0 ? `<text x="${frame.padX}" y="${frame.supportY}" font-family="${SANS}" font-size="${frame.supportSize}" fill="${WINE}">${escapeXml(frame.support)}</text>` : ""}
  <rect x="${frame.padX}" y="${frame.pillY}" width="${frame.pillW}" height="${frame.pillH}" rx="${frame.pillH / 2}" fill="${WINE}"/>
  <text x="${frame.padX + frame.pillW / 2}" y="${frame.pillTextY}" text-anchor="middle" font-family="${SANS}" font-size="${frame.pillFont}" font-weight="bold" fill="${PAPER}">${frame.pillLabel}</text>
</svg>`;
}

/** Quadro editorial: degradê vinho, selo dourado e headline serifada clara. */
function buildEditorialBanner(headline: readonly string[], width: number, height: number): string {
  const padX = Math.round(width * 0.055);
  const padTop = Math.max(44, Math.round(height * 0.045));
  const seal = Math.max(60, Math.round(width * 0.068));
  const word = Math.round(width * 0.038);
  const sealBaseline = padTop + Math.round(seal * 0.7);
  const textX = padX + seal + Math.round(width * 0.018);
  const lines = headline.filter((line) => line.trim().length > 0);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const titleSize = fitFont("x".repeat(longest), width, Math.round(width * 0.046), 30);
  const lineH = Math.round(titleSize * 1.22);
  const blockH = lines.length * lineH + Math.round(titleSize * 0.35);
  const bottom = Math.max(56, Math.round(height * 0.065));
  const firstBaseline = height - bottom - blockH + titleSize;

  const titles = lines
    .map(
      (line, i) =>
        `<text x="${padX}" y="${firstBaseline + i * lineH}" font-family="${SERIF}" font-size="${titleSize}" font-weight="bold" fill="${PAPER}">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(42,17,25,0.55)"/>
      <stop offset="0.22" stop-color="rgba(42,17,25,0)"/>
      <stop offset="0.52" stop-color="rgba(42,17,25,0)"/>
      <stop offset="0.78" stop-color="rgba(42,17,25,0.88)"/>
      <stop offset="1" stop-color="${WINE_DEEP}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#shade)"/>
  <rect x="${padX}" y="${padTop}" width="${seal}" height="${seal}" rx="${Math.round(seal * 0.22)}" fill="${GOLD}"/>
  <text x="${padX + seal / 2}" y="${sealBaseline}" text-anchor="middle" font-family="${SERIF}" font-size="${Math.round(seal * 0.58)}" font-weight="bold" fill="${WINE_DEEP}">E</text>
  <text x="${textX}" y="${sealBaseline - 4}" font-family="${SERIF}" font-size="${word}" font-weight="bold" fill="${PAPER}">Evente<tspan fill="${GOLD}">IA</tspan></text>
  <text x="${textX}" y="${sealBaseline + Math.round(word * 0.72)}" font-family="${SANS}" font-size="${Math.max(13, Math.round(word * 0.4))}" fill="${PAPER}">Você imagina. A EventeIA faz acontecer.</text>
  ${titles}
</svg>`;
}

/** Banner da peça. `editorial` quando a cena não leva cartões. */
export function buildBannerSvg(
  headline: readonly string[],
  width: number,
  height: number,
  mode: "lifestyle" | "editorial" = "lifestyle",
): string {
  if (mode === "editorial") {
    const lines = headline.length >= 3 ? headline.slice(0, 2) : headline;
    return buildEditorialBanner(lines, width, height);
  }
  const logo = { width: Math.round(width * 0.12), height: Math.round(width * 0.072) };
  return buildLifestyleBanner(headline, width, height, logo);
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

  const cardW = Math.round(width * 0.46);
  const cardH = Math.max(96, Math.round(cardW * 0.24));
  const gap = 16;
  const marginX = Math.round(width * 0.07);
  const marginBottom = Math.round(height * 0.055);
  const totalH = categories.length * cardH + (categories.length - 1) * gap;
  const startY = height - marginBottom - totalH;
  const startX = width - marginX - cardW;
  const iconR = Math.round(cardH * 0.16);
  const fontTitle = fitFont(
    "Orçamento recebido",
    cardW - iconR * 3 - 36,
    Math.round(width * 0.022),
    16,
  );
  const fontCat = Math.max(15, Math.round(fontTitle * 0.82));

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
        `<rect x="${startX + 3}" y="${y + 6}" width="${cardW}" height="${cardH}" rx="22" fill="rgba(61,27,40,0.16)"/>`,
        `<rect x="${startX}" y="${y}" width="${cardW}" height="${cardH}" rx="22" fill="${PAPER}"/>`,
        `<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="${WINE}"/>`,
        `<path d="M ${iconCx - iconR * 0.42} ${iconCy} l ${iconR * 0.3} ${iconR * 0.32} l ${iconR * 0.62} -${iconR * 0.7}" stroke="${PAPER}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<text x="${textX}" y="${titleY}" font-family="${SANS}" font-size="${fontTitle}" font-weight="bold" fill="${TEXT_DARK}">Orçamento recebido</text>`,
        `<text x="${textX}" y="${catY}" font-family="${SANS}" font-size="${fontCat}" fill="${WINE}">${escapeXml(cat)}</text>`,
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
export async function composeAd(imageBytes: Buffer, input: ComposeAdInput): Promise<Buffer> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const mode = input.categories.length > 0 ? "lifestyle" : "editorial";
  const padX = Math.round(width * 0.07);
  const padTop = Math.max(56, Math.round(width * 0.06));
  const logoH = Math.round(width * 0.072);
  const logo = mode === "lifestyle" ? await trimmedBrandMonogram(logoH) : null;
  const logoMeta = logo === null ? null : await sharp(logo).metadata();
  const logoBox = {
    width: logoMeta?.width ?? Math.round(width * 0.12),
    height: logoMeta?.height ?? logoH,
  };
  const banner = Buffer.from(
    mode === "editorial"
      ? buildEditorialBanner(input.headline, width, height)
      : buildLifestyleBanner(input.headline, width, height, logoBox),
  );
  const cards = Buffer.from(buildReceiptCardSvg(input.categories, width, height));
  const base = sharp(imageBytes).resize(width, height, { fit: "cover", position: "attention" });
  if (logo === null) {
    return base
      .composite([
        { input: banner, top: 0, left: 0 },
        { input: cards, top: 0, left: 0 },
      ])
      .jpeg({ quality: 88 })
      .toBuffer();
  }
  return base
    .composite([
      { input: banner, top: 0, left: 0 },
      { input: cards, top: 0, left: 0 },
      { input: logo, left: padX, top: padTop },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}
