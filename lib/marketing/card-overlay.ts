import "server-only";

import sharp from "sharp";

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

/** Tamanho de fonte que cabe na largura útil (librsvg não quebra linha). */
function fitFont(text: string, width: number, preferred: number, min: number): number {
  const avail = width * 0.86;
  const estimated = text.length * preferred * 0.52;
  if (estimated <= avail) return preferred;
  return Math.max(min, Math.floor(avail / (text.length * 0.52)));
}

/** Anúncio claro: degradê de papel no canto, selo, título serifado e pílula. */
function buildLifestyleBanner(headline: readonly string[], width: number, height: number): string {
  const padX = Math.round(width * 0.055);
  const padTop = Math.max(48, Math.round(Math.min(height * 0.06, width * 0.07)));
  const seal = Math.max(64, Math.round(width * 0.07));
  const word = fitFont("EventeIA", width - seal - padX, Math.round(width * 0.04), 22);
  const title = headline[0] ?? "";
  const support = headline[1] ?? "";
  const titleSize = fitFont(title, width, Math.round(width * 0.048), 28);
  const supportSize = fitFont(support, width, Math.round(width * 0.026), 18);
  const sealY = padTop;
  const sealBaseline = sealY + Math.round(seal * 0.7);
  const textX = padX + seal + Math.round(width * 0.02);
  const sloganY = sealBaseline + Math.round(word * 1.05);
  const titleY = sealY + seal + Math.round(titleSize * 1.35);
  const supportY = titleY + Math.round(supportSize * 1.7);
  const pillH = Math.max(48, Math.round(width * 0.048));
  const pillFont = Math.round(pillH * 0.4);
  const pillLabel = "eventeia.com.br";
  const pillW = Math.round(pillLabel.length * pillFont * 0.58 + pillH);
  const pillY = (support.length > 0 ? supportY : titleY) + Math.round(pillH * 0.55);
  const pillTextY = pillY + Math.round(pillH * 0.66);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,253,250,0.92)"/>
      <stop offset="0.22" stop-color="rgba(255,253,250,0.55)"/>
      <stop offset="0.42" stop-color="rgba(255,253,250,0)"/>
      <stop offset="1" stop-color="rgba(255,253,250,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#wash)"/>
  <rect x="${padX}" y="${sealY}" width="${seal}" height="${seal}" rx="${Math.round(seal * 0.22)}" fill="${GOLD}"/>
  <text x="${padX + seal / 2}" y="${sealBaseline}" text-anchor="middle" font-family="${SERIF}" font-size="${Math.round(seal * 0.58)}" font-weight="bold" fill="${WINE_DEEP}">E</text>
  <text x="${textX}" y="${sealBaseline - Math.round(word * 0.15)}" font-family="${SERIF}" font-size="${word}" font-weight="bold" fill="${WINE}">EventeIA</text>
  <text x="${textX}" y="${sloganY}" font-family="${SANS}" font-size="${Math.max(14, Math.round(word * 0.42))}" fill="${WINE}">Você imagina. A EventeIA faz acontecer.</text>
  <text x="${padX}" y="${titleY}" font-family="${SERIF}" font-size="${titleSize}" font-weight="bold" fill="${WINE}">${escapeXml(title)}</text>
  ${support.length > 0 ? `<text x="${padX}" y="${supportY}" font-family="${SANS}" font-size="${supportSize}" fill="${WINE}">${escapeXml(support)}</text>` : ""}
  <rect x="${padX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${WINE}"/>
  <text x="${padX + pillW / 2}" y="${pillTextY}" text-anchor="middle" font-family="${SANS}" font-size="${pillFont}" font-weight="bold" fill="${PAPER}">${pillLabel}</text>
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
  return mode === "editorial"
    ? buildEditorialBanner(headline, width, height)
    : buildLifestyleBanner(headline, width, height);
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
  const marginX = Math.round(width * 0.05);
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
  const banner = Buffer.from(buildBannerSvg(input.headline, width, height, mode));
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
