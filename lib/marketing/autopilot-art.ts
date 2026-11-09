import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sniffMime } from "@/lib/nvidia/pure";
import { ART_BUCKET, storeArtBytes } from "@/lib/prospecting/art-cache";
import { EVENT_PHOTOS } from "@/lib/prospecting/photos";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { loadUsedMedia, recordMediaUse, type RecordMediaUseInput } from "./autopilot-media";
import { composeAd, HEADLINES_BY_THEME, RECEIPT_CATEGORIES_BY_THEME } from "./card-overlay";
import { contentHash, type MediaUse } from "./media-dedup";
import type { MarketingTheme } from "./themes";
import type { MarketingPromptVariant } from "./image-prompt";

/**
 * Arte do autopilot: foto REAL (Unsplash/Pexels) + composição sharp do banner
 * (headline no topo) e dos cards "Orçamento recebido" (rodapé). Texto nítido e
 * determinístico — nada de IA (sem FLUX, sem logo colada).
 * Dedup por sha256 do conteúdo final; qualquer falha retorna `null` (fallback).
 */

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
export const REEL_SECONDS_PER_IMAGE = 3;

const POST_SIZE = { width: 1080, height: 1080 } as const;
const STORY_SIZE = { width: 1080, height: 1920 } as const;

export interface ReelFfmpegOptions {
  fps?: number;
  secondsPerImage?: number;
  width?: number;
  height?: number;
}

/** Argumentos do ffmpeg para o reel (slideshow com zoom sutil, Ken Burns). */
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

/** URL absoluta da foto real do tema (arquivo em /public, servido pelo app). */
function realPhotoUrl(theme: MarketingTheme): string {
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const photo = EVENT_PHOTOS[theme.key] ?? "/img/eventos/festa-infantil-velas.jpg";
  return `${appUrl}${photo}`;
}

/** Headline de banner do tema (fallback infantil). */
function headlineFor(theme: MarketingTheme): readonly string[] {
  return HEADLINES_BY_THEME[theme.key] ?? HEADLINES_BY_THEME.infantil;
}

/** Categorias dos cards do tema (fallback infantil). */
function categoriesFor(theme: MarketingTheme): readonly string[] {
  return RECEIPT_CATEGORIES_BY_THEME[theme.key] ?? RECEIPT_CATEGORIES_BY_THEME.infantil;
}

/** Dependências injetáveis do autopilot (testes não rodam rede/ffmpeg/Supabase). */
export interface AutopilotArtDeps {
  fetchImpl?: typeof fetch;
  loadUsed?: () => Promise<readonly MediaUse[]>;
  recordUse?: (input: RecordMediaUseInput) => Promise<void>;
  /** Baixa a foto e compõe banner + cards (default: sharp real). */
  buildImage?: (
    bytes: Buffer,
    headline: readonly string[],
    categories: readonly string[],
    size: { width: number; height: number },
  ) => Promise<Buffer>;
  storeImage?: (bytes: Buffer) => Promise<string>;
  renderReel?: (buffers: readonly Buffer[]) => Promise<Buffer>;
  storeVideo?: (bytes: Buffer) => Promise<string>;
}

/** Arte quadrada (1080×1080) do post; `null` em qualquer falha/colisão. */
export async function generatePostArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
  variant: MarketingPromptVariant = "cards",
): Promise<{ url: string } | null> {
  return generateUniqueArt(theme, POST_SIZE, "post", deps, variant);
}

/** Arte vertical (1080×1920) do story; `null` em qualquer falha/colisão. */
export async function generateStoryArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
  variant: MarketingPromptVariant = "cards",
): Promise<{ url: string } | null> {
  return generateUniqueArt(theme, STORY_SIZE, "story", deps, variant);
}

async function generateUniqueArt(
  theme: MarketingTheme,
  size: { width: number; height: number },
  kind: "post" | "story",
  deps: AutopilotArtDeps,
  variant: MarketingPromptVariant,
): Promise<{ url: string } | null> {
  try {
    const used = new Set((await (deps.loadUsed ?? loadUsedMedia)()).map((use) => use.key));
    const fetchImpl = deps.fetchImpl ?? fetch;
    const buildImage =
      deps.buildImage ??
      ((bytes, headline, categories, sz) => composeAd(bytes, { headline, categories, ...sz }));
    const storeImage = deps.storeImage ?? storeImageBytes;
    const recordUse = deps.recordUse ?? recordMediaUse;

    const raw = await downloadBytes(realPhotoUrl(theme), fetchImpl);
    const headline = headlineFor(theme);
    const categories = variant === "emotional" ? [] : categoriesFor(theme);
    const finalBytes = await buildImage(raw, headline, categories, size);
    const key = contentHash(finalBytes);
    if (used.has(key)) return null; // foto repetida → desiste (não repete)

    const url = await storeImage(finalBytes);
    await recordUse({ mediaKey: key, kind, theme: theme.key, url });
    return { url };
  } catch (error) {
    logger.warn(
      { theme: theme.key, kind, error: String(error) },
      "autopilot-art: falha ao montar arte",
    );
    return null;
  }
}

/** Reel: foto real + cards, vídeo vertical com Ken Burns. `null` em falha. */
export async function generateReelArt(
  theme: MarketingTheme,
  deps: AutopilotArtDeps = {},
  variant: MarketingPromptVariant = "cards",
): Promise<{ url: string } | null> {
  try {
    const used = new Set((await (deps.loadUsed ?? loadUsedMedia)()).map((use) => use.key));
    const fetchImpl = deps.fetchImpl ?? fetch;
    const buildImage =
      deps.buildImage ??
      ((bytes, headline, categories, sz) => composeAd(bytes, { headline, categories, ...sz }));
    const renderReel = deps.renderReel ?? renderReelVideo;
    const storeVideo = deps.storeVideo ?? storeVideoBytes;
    const recordUse = deps.recordUse ?? recordMediaUse;

    const raw = await downloadBytes(realPhotoUrl(theme), fetchImpl);
    const headline = headlineFor(theme);
    const categories = variant === "emotional" ? [] : categoriesFor(theme);
    const frame = await buildImage(raw, headline, categories, { width: REEL_WIDTH, height: REEL_HEIGHT });

    const video = await renderReel([frame, frame, frame]);
    const key = contentHash(video);
    if (used.has(key)) return null;

    const url = await storeVideo(video);
    await recordUse({ mediaKey: key, kind: "reel", theme: theme.key, url });
    return { url };
  } catch (error) {
    logger.warn({ theme: theme.key, error: String(error) }, "autopilot-art: falha ao gerar reel");
    return null;
  }
}
