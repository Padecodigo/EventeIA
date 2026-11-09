import "server-only";

import sharp from "sharp";

/**
 * Aplica a identidade visual EventeIA a uma imagem gerada pelo FLUX: chip
 * branco arredondado (canto inferior direito) com a logo `logo-e.png`.
 * Porta fiel de `scripts/generate-brand-art.mjs` — mesmas constantes de
 * padding/ratio/raio/opacidade/qualidade, para ficar idêntico às artes
 * estáticas já elogiadas.
 *
 * A logo vai embutida (base64) porque o worker não monta `public/`; assim o
 * compositing funciona tanto no app quanto no worker.
 */

const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAWgAAADKCAMAAAC/mCq2AAADAFBMVEVMaXFZTT3x6uFeRCs+BAK/s4KZg31YSDB8Y1D9/s3axadPMxp2Z1dVSTz86saLZUNkRiieeVGEXzvg3NRwXUmle1GbjnyAYUKcc0q0jGJOPSzHn3DGu6mWb0iRhXSTcU91YkyihGOifljLpnrfwJfBmm1qTjOTbUbNrIOrglh3XEKujWifj3h7a1fOsIxkUDisiGC9lWiKeGFqUjnixp1uUzlcQyqZdE69mnPEoXjFp4S2nH+afF3lz67cu462kmtVPCTXuZK8pYnTu5xfTDfVtIpnVkRgSjFVPSS6rJfFrI7gyahUQS1uWEBiTTeCcVqNa0u2lnN6ZUyjknxrUjikim6aiHFTPihHLxliSzO1pYu9oX+pm4Ovlnnr1bTUvp/Ar5VSPSWIdmGukXBQPy59aVFsVj5LOCOfjXO4qJKHclpYQy1INSPBrZGaiXJ5Zk5LMhsyFwm0o4q0nYFvVTnUwqjx3LhIMyC1ooiCa1DNuZuUeVuDbFK1oouchGnj0LKrk3iQfGTr17qol4DOvKGjjXDay7Lcyav25cXDspt+Zks/KBTBr5X/99ORel/ez7KKcVT77Mz169bz4b/p1rj66Mjcyq98Z0+ab0OwglGugE6qfEqsfkyneUiFWjCKXzWgdEa4ilexhVald0a1h1WXbEG6jFqpfU6IXDWziVyBVi2zhFDInmqeckWjdkmsgFHt0aSTZzvszJjoyJnClmPNo2/rzZ6mekzPpnTLoG334LljPRzu1arWrXnGm2nfuISOYjddPyOfcEDCmWbpx5PjwZBbOBjZsX7Qpm+/k2HGmWbdtYDkwY2+kF5ySSSidEOQZDlxUC67j17hvov13bLVq3XSqHTfu4jBj1aTaUCbbT55TyqKYDrZtINqQyDvz56DXDbTroH55L7ivIeXaTzat4jx1ab02KrRq3rasXl8WTfGlVy8ilPoyp/nxJDPomnkxJWNZj7LnGN2Vjfy2a/QtZa7kWNqSSm4hk+GaEny06LYrXONclXbwZ/Up21BJhE/1ettAAAA9nRSTlMADQP9AQMEAwIB7/4gFf79/v7+CVT+IP7+/iL+Ff4R/mf9/v7+/v3+/f3+/TQt/Kn+/mrJ/v3v/v7+/v7+/v7+/P7+/m3+QdHSJ/39WZN9Of79qqvx/Xi/v+J+/U37/euQrEn9MHW8fbc9pZJI4FiI471j7t2h/prPxtz2/Krq5OSX7JDD1UzXjmvZZ7n9vnDvqSXSwuOK7f////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////6GSqtzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAgAElEQVR42u2dB1yU57LGP2FhdwWkN2kCgjQRlA6KDUWwK3axG40l3lhiEmNiElNNLwcQpIOLSFEQRKrYQBAXFIKCil1yUAgCBwO595lv15IIEQ2c34XdEdBERfk7O9+88848wzBSk5rUpCY1qUlNalKTmtSkJjWpSU1qUpOa1KQmNalJTWpSk5rUpCY1qUlNalKTmtSkJjWpSU1qUpOa1KQmNalJTWpSk5rUpPZfMX53mRRlR8bh8OTkZGBy3fcpeVKsfzE5Obkn/idv2I/MEKakxP5QSfx9F01rktakSfQuIwX7p0ghYizP1Vq0duk332z9uD/Md+T7n77//o/vf0j2I33/fv8lrPV/oW1dunXrzz///Pkna99k5KR8RcZjKcvYLHhvw4YlI/23Xb++LeO6/7aMH7776bvvP9+4oWnsQnf3FYvdfXya2tsdHOoHi83Boa6uLoksMzPzId7Z7x9eyLh+fcB3n3333Wfff/YT89EiKWiRL8uDA19r4/bNtmMcCJ6Dr+/IAR9+891XAz7dvvjd+VazvSdOHAGb6O1trmKuPd144RgHh8Gjbt2qvnXr1qiT9fX1hw8frntioA7UGV+RDRgw4Ps1Woz0gUjOzGF4Wgu2j23y8rKo8Rp1y2tM+8jrP332/fd7Pmizmj9s/Eob/aegJg0dPmWiU4uw1drW4fDJsrKKirKyMoA+QoSPsAanJs7XB1wfQPbT1tcZ6dMQmBnGcON7bk22rqampndraiy86pP8M3767vOZbeYjBg2VEacij41eAIzW8pnzZVu0rb0O3y8qKzsJY3368GExaDZ0iDDD2lcx8hKPWZ7hK85a7GZqZmamR6QtvByS6jK3ZWz4VnvLIC0GXLnyPN4zL3weT55L0VzG5o3ZKkIjt/p64nyyTBw/iHNS5oVtGSLO1+ntg6GS7tEcPAEV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";

const CORNER_PADDING = 24; // distância da logo ao canto inferior direito
const LOGO_WIDTH_RATIO = 0.2; // largura da logo = 20% da largura da arte
const BG_INNER_PAD = 16; // respiro interno do fundo branco atrás da logo
const BG_RADIUS = 24; // raio do retângulo arredondado
const BG_OPACITY = 0.88; // opacidade do fundo branco
const JPEG_QUALITY = 82;

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Overlay {
  input: Buffer;
  left: number;
  top: number;
}

/** Bounding box dos pixels não transparentes da logo (trim determinístico). */
async function logoBounds(): Promise<Bounds> {
  const { data, info } = await sharp(Buffer.from(LOGO_PNG_BASE64, "base64"))
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
  if (maxX < 0) throw new Error("Logo sem pixels opacos");
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** SVG de retângulo arredondado branco com a opacidade definida. */
function roundedRectSvg(width: number, height: number, radius: number, opacity: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="rgba(255,255,255,${opacity})"/>` +
      `</svg>`,
  );
}

/** Overlays (fundo branco + logo) para compor no canto inferior direito. */
async function logoOverlays(imgW: number, imgH: number): Promise<Overlay[]> {
  const bounds = await logoBounds();
  const logoW = Math.max(1, Math.round(imgW * LOGO_WIDTH_RATIO));
  const logoH = Math.max(1, Math.round((logoW * bounds.height) / bounds.width));
  const logo = await sharp(Buffer.from(LOGO_PNG_BASE64, "base64"))
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

/** PNG do monograma (transparente), para o anúncio claro compor sem o chip. */
function brandMonogramPng(): Buffer {
  return Buffer.from(LOGO_PNG_BASE64, "base64");
}

/** Monograma aparado e na altura pedida. */
export async function trimmedBrandMonogram(height: number): Promise<Buffer> {
  const trimmed = await sharp(brandMonogramPng()).trim().png().toBuffer();
  return sharp(trimmed)
    .resize({ height: Math.max(1, height) })
    .png()
    .toBuffer();
}

/** Aplica a logo (chip branco) à imagem e devolve JPEG com a marca. */
export async function applyBrandLogo(imageBytes: Buffer): Promise<Buffer> {
  const normalized = await sharp(imageBytes).png().toBuffer({ resolveWithObject: true });
  const overlays = await logoOverlays(normalized.info.width, normalized.info.height);
  return sharp(normalized.data).composite(overlays).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}
