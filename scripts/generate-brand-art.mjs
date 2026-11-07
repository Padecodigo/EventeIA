/**
 * Gera as artes de prospecção da EventeIA com a logo:
 *   - POST   (public/brand/posts/{key}.jpg)  — feed, proporção original (largura máx. 1200px)
 *   - STORY  (public/brand/stories/{key}.jpg) — 9:16, 1080x1920 (cover)
 *
 * Determinístico: mesma entrada sempre produz a mesma saída — sem aleatoriedade.
 * Uso: `node scripts/generate-brand-art.mjs` (ou `pnpm brand:art`).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_PATH = path.join(ROOT, "public", "logo-e.png");
const POST_DIR = path.join(ROOT, "public", "brand", "posts");
const STORY_DIR = path.join(ROOT, "public", "brand", "stories");

/** Foto base por tipo de evento (relativa à raiz do projeto). */
const BASE_PHOTOS = {
  infantil: "public/img/eventos/festa-infantil-velas.jpg",
  aniversario: "public/festa-aniversario.jpg",
  casamento: "public/img/eventos/casamento.jpg",
  "15-anos": "public/img/eventos/15-anos.jpg",
  formatura: "public/img/eventos/festa-formatura-baile.jpg",
  corporativo: "public/img/eventos/corporativo.webp",
};

// Parâmetros visuais (determinísticos).
const POST_MAX_WIDTH = 1200; // largura máxima da foto base (não amplia imagens menores)
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const CORNER_PADDING = 24; // distância da logo ao canto inferior direito
const LOGO_WIDTH_RATIO = 0.2; // largura da logo = 20% da largura da arte
const BG_INNER_PAD = 16; // respiro interno do fundo branco atrás da logo
const BG_RADIUS = 24; // raio do retângulo arredondado
const BG_OPACITY = 0.88; // opacidade do fundo branco
const JPEG_QUALITY = 82;

const resolve = (p) => path.join(ROOT, p);

/** Bounding box dos pixels não transparentes da logo (trim manual, determinístico). */
async function logoBounds() {
  const { data, info } = await sharp(LOGO_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + (channels - 1)];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("Logo sem pixels opacos: " + LOGO_PATH);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** SVG de retângulo arredondado branco com a opacidade definida. */
function roundedRectSvg(width, height, radius, opacity) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="rgba(255,255,255,${opacity})"/>` +
      `</svg>`,
  );
}

/** Overlays (fundo branco + logo) para compor no canto inferior direito. */
async function logoOverlays(imgW, imgH) {
  const bounds = await logoBounds();
  const logoW = Math.max(1, Math.round(imgW * LOGO_WIDTH_RATIO));
  const logoH = Math.max(1, Math.round((logoW * bounds.height) / bounds.width));
  const logo = await sharp(LOGO_PATH)
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .resize({ width: logoW })
    .png()
    .toBuffer();

  const rectW = logoW + BG_INNER_PAD * 2;
  const rectH = logoH + BG_INNER_PAD * 2;
  const rect = roundedRectSvg(rectW, rectH, BG_RADIUS, BG_OPACITY);

  const rectLeft = imgW - CORNER_PADDING - rectW;
  const rectTop = imgH - CORNER_PADDING - rectH;
  const logoLeft = rectLeft + BG_INNER_PAD;
  const logoTop = rectTop + BG_INNER_PAD;

  return [
    { input: rect, left: rectLeft, top: rectTop },
    { input: logo, left: logoLeft, top: logoTop },
  ];
}

async function generatePost(key, baseRel) {
  const resized = await sharp(resolve(baseRel))
    .resize({ width: POST_MAX_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const overlays = await logoOverlays(resized.info.width, resized.info.height);
  await sharp(resized.data)
    .composite(overlays)
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(path.join(POST_DIR, `${key}.jpg`));
  return { key, w: resized.info.width, h: resized.info.height, kind: "post" };
}

async function generateStory(key, baseRel) {
  const resized = await sharp(resolve(baseRel))
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const overlays = await logoOverlays(STORY_WIDTH, STORY_HEIGHT);
  await sharp(resized.data)
    .composite(overlays)
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(path.join(STORY_DIR, `${key}.jpg`));
  return { key, w: STORY_WIDTH, h: STORY_HEIGHT, kind: "story" };
}

async function main() {
  await mkdir(POST_DIR, { recursive: true });
  await mkdir(STORY_DIR, { recursive: true });
  const results = [];
  for (const [key, baseRel] of Object.entries(BASE_PHOTOS)) {
    results.push(await generatePost(key, baseRel));
    results.push(await generateStory(key, baseRel));
  }
  for (const r of results) {
    const dir = r.kind === "post" ? POST_DIR : STORY_DIR;
    console.log(`✓ ${r.key} (${r.kind}): ${r.w}x${r.h} -> ${path.relative(ROOT, dir)}/${r.key}.jpg`);
  }
  console.log(`\n${results.length} artes geradas.`);
}

await main();
