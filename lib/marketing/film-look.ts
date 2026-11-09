import sharp from "sharp";

/**
 * Pós-processamento da cena gerada (Flux Dev e o fallback), antes do layout.
 * O objetivo é tirar o aspecto liso de imagem de IA. O texto do anúncio entra
 * depois, por cima, e não passa por este grão.
 */
export const FILM_LOOK = {
  /** Saturação (1 = original). Leve dessaturação. */
  saturation: 0.88,
  /** Multiplicadores RGB. Um pouco mais de vermelho, um pouco menos de azul. */
  warmth: [1.05, 1.01, 0.94] as const,
  /** Deslocamento RGB em 0–255, quente e curto. */
  warmthOffset: [4, 1, -3] as const,
  /** Desfoque gaussiano em pixels. Suavidade leve, sem borrar o motivo. */
  softnessSigma: 0.45,
  /** Desvio do ruído gaussiano do grão (0–255). */
  grainSigma: 14,
  /** Opacidade do grão composto em overlay. */
  grainOpacity: 0.16,
  /** Opacidade da borda do vinheta. */
  vignetteOpacity: 0.22,
  /** Qualidade do JPEG regravado. */
  jpegQuality: 86,
} as const;

function vignetteSvg(width: number, height: number): Buffer {
  const opacity = FILM_LOOK.vignetteOpacity.toFixed(2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><radialGradient id="v" cx="50%" cy="46%" r="72%">` +
      `<stop offset="58%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="${opacity}"/>` +
      `</radialGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#v)"/>` +
      `</svg>`,
  );
}

/** Aplica grão, calor, dessaturação, vinheta, suavidade e regrava em JPEG. */
export async function applyFilmLook(imageBytes: Buffer): Promise<Buffer> {
  const graded = sharp(imageBytes)
    .rotate()
    .modulate({ saturation: FILM_LOOK.saturation })
    .linear([...FILM_LOOK.warmth], [...FILM_LOOK.warmthOffset])
    .blur(FILM_LOOK.softnessSigma);

  const { data, info } = await graded.raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;

  const grain = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: FILM_LOOK.grainSigma },
    },
  })
    .ensureAlpha(FILM_LOOK.grainOpacity)
    .png()
    .toBuffer();

  return sharp(data, { raw: { width, height, channels: info.channels } })
    .composite([
      { input: grain, blend: "overlay" },
      { input: vignetteSvg(width, height), blend: "over" },
    ])
    .jpeg({ quality: FILM_LOOK.jpegQuality })
    .toBuffer();
}
