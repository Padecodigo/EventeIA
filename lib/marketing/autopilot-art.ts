import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateImage } from "@/lib/modelslab/client";
import { sniffMime } from "@/lib/nvidia/pure";
import { ART_BUCKET, storeArtBytes } from "@/lib/prospecting/art-cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { loadUsedMedia, recordMediaUse, type RecordMediaUseInput } from "./autopilot-media";
import { applyBrandLogo } from "./brand-logo";
import { buildMarketingImagePrompt } from "./image-prompt";
import { contentHash, FLUX_MAX_RETRIES, type MediaUse } from "./media-dedup";
import type { MarketingTheme } from "./themes";

/**
 * Arte do autopilot gerada com FLUX (diffusor de imagem) via ModelsLab/NVIDIA.
 * Cada geração varia o prompt (nonce aleatório) e o hash SHA-256 do conteúdo é
 * deduplicado contra o registro de mídias já publicadas: colisão ⇒ regenera.
 * Toda falha retorna `null` para o chamador cair no fallback de arte estática.
 */

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
export const REEL_SECONDS_PER_IMAGE = 2.5;
export const REEL_IMAGES = 3;

const POST_SIZE = { width: 1080, height: 1080 } as const;
const STORY_SIZE = { width: 1080, height: 1920 } as const;

export interface ReelFfmpegOptions {
  fps?: number;
  secondsPerImage?: number;
  width?: number;
  height?: number;
}

/**
 * Argumentos do ffmpeg para o reel (slideshow com zoom sutil, Ken Burns).
 * Puro e determinístico: não executa ffmpeg, só monta o vetor de argumentos.
 */
export function buildReelFfmpegArgs(
  inputs: readonly string[],
  outputPath: string,
  opts: ReelFfmpegOptions = {},
): string[] {
  const fps = opts.fps ?? REEL_FPS;
  const seconds = opts.secondsPerImage ?? REEL_SECONDS_PER_IMAGE;
  const width = opts.width ?? REEL_WIDTH;
  const height = opts.height ?? REEL_HEIGHT;

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const input of inputs) {
    args.push("-loop", "1", "-framerate", String(fps), "-t", String(seconds), "-i", input);
  }

  const branches: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const label = `v${i}`;
    branches.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,` +
        `zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},format=yuv420p[${label}]`,
    );
    labels.push(`[${label}]`);
  }
  const concat = `${labels.join("")}concat=n=${inputs.length}:v=1:a=0[outv]`;
  args.push("-filter_complex", branches.concat(concat).join(";"));
  args.push("-map", "[outv]");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart");
  args.push(outputPath);

  return args;
}

/** Baixa uma URL de imagem para bytes (I/O injetável nos testes). */
async function downloadBytes(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download da imagem falhou (${String(response.status)})`);
  return Buffer.from(await response.arrayBuffer());
}

/** Sobe os bytes do MP4 no Storage e devolve a URL pública. */
async function storeVideoBytes(bytes: Buffer): Promise<string> {
  const storage = getSupabaseAdmin().storage.from(ART_BUCKET);
  const key = `${randomUUID()}.mp4`;
  const { error } = await storage.upload(key, bytes, { contentType: "video/mp4", upsert: false });
  if (error !== null) throw new Error(`upload do reel falhou (${error.message})`);
  const { data } = storage.getPublicUrl(key);
  return data.publicUrl;
}

/** Sobe os bytes de uma imagem no Storage e devolve a URL pública. */
async function storeImageBytes(bytes: Buffer): Promise<string> {
  const stored = await storeArtBytes(bytes, sniffMime(bytes) ?? "image/jpeg");
  return stored.url;
}

/** Renderiza o slideshow com ffmpeg a partir de buffers de imagem. */
async function renderReelVideo(buffers: readonly Buffer[]): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "eventeia-reel-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < buffers.length; i += 1) {
      const file = path.join(dir, `frame-${i}.jpg`);
      await writeFile(file, buffers[i]);
      inputs.push(file);
    }
    const output = path.join(dir, "reel.mp4");
    await runFfmpeg(buildReelFfmpegArgs(inputs, output));
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** `execFile` sem shell: caminhos nunca são interpolados em string. */
function runFfmpeg(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", [...args], (error, _stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`ffmpeg falhou (${String(stderr).slice(0, 300)})`));
        return;
      }
      resolve();
    });
  });
}

/** Prompt base + nonce aleatório: sem seed fixo, cada chamada é única. */
function variedPrompt(theme: MarketingTheme, vertical: boolean): string {
  return `${buildMarketingImagePrompt(theme, { vertical })} Variação única ${randomUUID()}.`;
}

interface GenerateImagesInput {
  apiKey: string;
  basePrompt: string;
  count: number;
  fetchImpl?: typeof fetch;
}

/**
 * Gera `count` imagens. Pede `samples: count` na primeira chamada (ModelsLab
 * devolve várias de uma vez); se o provedor devolver menos (ex.: NVIDIA retorna
 * 1), completa com chamadas adicionais — cada uma com um nonce novo.
 */
async function generateVerticalImages(input: GenerateImagesInput): Promise<string[]> {
  const images: string[] = [];
  const first = await generateImage({
    apiKey: input.apiKey,
    prompt: variedPromptFromBase(input.basePrompt),
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    samples: input.count,
    fetchImpl: input.fetchImpl,
  });
  if (first.ok) images.push(...first.images);
  while (images.length < input.count) {
    const extra = await generateImage({
      apiKey: input.apiKey,
      prompt: variedPromptFromBase(input.basePrompt),
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      samples: input.count - images.length,
      fetchImpl: input.fetchImpl,
    });
    if (!extra.ok) break;
    images.push(...extra.images);
  }
  return images.slice(0, input.count);
}

function variedPromptFromBase(base: string): string {
  return `${base} Variação única ${randomUUID()}.`;
}

function hasApiKey(key: string | undefined): key is string {
  return key !== undefined && key.length > 0;
}

/** Dependências injetáveis do autopilot (testes não rodam rede/ffmpeg/Supabase). */
export interface AutopilotArtDeps {
  fetchImpl?: typeof fetch;
  /** Carrega as mídias já usadas (default: banco). */
  loadUsed?: () => Promise<readonly MediaUse[]>;
  /** Registra uma mídia usada (default: banco). */
  recordUse?: (input: RecordMediaUseInput) => Promise<void>;
  /** Aplica a logo EventeIA à imagem (default: sharp real). */
  brandImage?: (bytes: Buffer) => Promise<Buffer>;
  /** Sobe uma imagem e devolve a URL pública (default: Storage). */
  storeImage?: (bytes: Buffer) => Promise<string>;
  /** Renderiza o MP4 do reel (default: ffmpeg real). */
  renderReel?: (buffers: readonly Buffer[]) => Promise<Buffer>;
  /** Sobe o MP4 e devolve a URL pública (default: Storage). */
  storeVideo?: (bytes: Buffer) => Promise<string>;
}

/** Arte quadrada (1080×1080) do post; `null` em qualquer falha/colisão. */
export async function generatePostArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
): Promise<{ url: string } | null> {
  return generateUniqueArt(theme, POST_SIZE, "post", deps);
}

/** Arte vertical (1080×1920) do story; `null` em qualquer falha/colisão. */
export async function generateStoryArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
): Promise<{ url: string } | null> {
  return generateUniqueArt(theme, STORY_SIZE, "story", deps);
}

async function generateUniqueArt(
  theme: MarketingTheme,
  size: { width: number; height: number },
  kind: "post" | "story",
  deps: AutopilotArtDeps,
): Promise<{ url: string } | null> {
  try {
    const apiKey = serverEnv().MODELSLAB_API_KEY;
    if (!hasApiKey(apiKey)) return null;
    const used = new Set((await (deps.loadUsed ?? loadUsedMedia)()).map((use) => use.key));
    const brandImage = deps.brandImage ?? applyBrandLogo;
    const storeImage = deps.storeImage ?? storeImageBytes;
    const recordUse = deps.recordUse ?? recordMediaUse;
    const fetchImpl = deps.fetchImpl ?? fetch;

    for (let attempt = 0; attempt < FLUX_MAX_RETRIES; attempt += 1) {
      const prompt = variedPrompt(theme, size.height > size.width);
      const result = await generateImage({
        apiKey,
        prompt,
        width: size.width,
        height: size.height,
        samples: 1,
        fetchImpl,
      });
      if (!result.ok) {
        logger.warn(
          { theme: theme.key, kind, error: result.error },
          "autopilot-art: FLUX sem imagem",
        );
        return null;
      }
      const sourceUrl = result.images[0];
      if (sourceUrl === undefined) return null;
      const branded = await brandImage(await downloadBytes(sourceUrl, fetchImpl));
      const key = contentHash(branded);
      if (used.has(key)) continue; // colisão de conteúdo → regenera
      const url = await storeImage(branded);
      await recordUse({ mediaKey: key, kind, theme: theme.key, url });
      return { url };
    }

    logger.warn({ theme: theme.key, kind }, "autopilot-art: colisões esgotaram as tentativas");
    return null;
  } catch (error) {
    logger.warn(
      { theme: theme.key, kind, error: String(error) },
      "autopilot-art: falha ao gerar arte",
    );
    return null;
  }
}

/**
 * Gera 3 imagens verticais (1080×1920) únicas, monta um slideshow MP4 com
 * ffmpeg e sobe no Storage. `null` em qualquer falha/colisão.
 */
export async function generateReelArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
): Promise<{ url: string } | null> {
  try {
    const apiKey = serverEnv().MODELSLAB_API_KEY;
    if (!hasApiKey(apiKey)) return null;
    const used = new Set((await (deps.loadUsed ?? loadUsedMedia)()).map((use) => use.key));
    const brandImage = deps.brandImage ?? applyBrandLogo;
    const renderReel = deps.renderReel ?? renderReelVideo;
    const storeVideo = deps.storeVideo ?? storeVideoBytes;
    const recordUse = deps.recordUse ?? recordMediaUse;
    const fetchImpl = deps.fetchImpl ?? fetch;

    for (let attempt = 0; attempt < FLUX_MAX_RETRIES; attempt += 1) {
      const images = await generateVerticalImages({
        apiKey,
        basePrompt: buildMarketingImagePrompt(theme, { vertical: true }),
        count: REEL_IMAGES,
        fetchImpl,
      });
      if (images.length < REEL_IMAGES) return null;

      const buffers: Buffer[] = [];
      for (const url of images) buffers.push(await brandImage(await downloadBytes(url, fetchImpl)));
      const keys = buffers.map((buffer) => contentHash(buffer));
      if (keys.some((key) => used.has(key))) continue; // alguma imagem repetida → regenera

      const video = await renderReel(buffers);
      const url = await storeVideo(video);
      for (const key of keys) {
        await recordUse({ mediaKey: key, kind: "reel", theme: theme.key, url });
      }
      return { url };
    }

    logger.warn({ theme: theme.key }, "autopilot-art: colisões do reel esgotaram as tentativas");
    return null;
  } catch (error) {
    logger.warn({ theme: theme.key, error: String(error) }, "autopilot-art: falha ao gerar reel");
    return null;
  }
}
