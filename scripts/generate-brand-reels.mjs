/**
 * Gera os REELS da EventeIA (vídeo vertical 9:16) a partir dos quadros editoriais
 * (public/brand/reel-frames). O zoom é curto de propósito: o texto do quadro
 * permanece dentro do quadro. Determinístico: mesma entrada → mesma saída.
 * Uso: `node scripts/generate-brand-reels.mjs` (ou `pnpm brand:reels`).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRAME_DIR = path.join(ROOT, "public", "brand", "reel-frames");
const REEL_DIR = path.join(ROOT, "public", "brand", "reels");

const KEYS = ["infantil", "aniversario", "casamento", "15-anos", "formatura", "corporativo"];

const DURATION = 8; // segundos
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

/** libx264 no Ubuntu; libopenh264 onde o x264 não está compilado. */
async function h264Encoder() {
  const { stdout } = await exec("ffmpeg", ["-hide_banner", "-encoders"]);
  if (stdout.includes("libx264")) return "libx264";
  if (stdout.includes("libopenh264")) return "libopenh264";
  throw new Error("ffmpeg sem encoder H.264 (libx264 ou libopenh264)");
}

async function makeReel(key, encoder) {
  const input = path.join(FRAME_DIR, `${key}.jpg`);
  const output = path.join(REEL_DIR, `${key}.mp4`);
  // +0.0001 por quadro ≈ 3% em 8s. Margem do layout aguenta esse recorte.
  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    input,
    "-t",
    String(DURATION),
    "-r",
    String(FPS),
    "-vf",
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0001,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    "-c:v",
    encoder,
    ...(encoder === "libx264" ? ["-preset", "medium", "-crf", "23"] : ["-b:v", "2500k"]),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
  await exec("ffmpeg", args);
  return output;
}

async function main() {
  await mkdir(REEL_DIR, { recursive: true });
  const encoder = await h264Encoder();
  for (const key of KEYS) {
    const out = await makeReel(key, encoder);
    console.log(`✓ ${key} -> ${path.relative(ROOT, out)}`);
  }
  console.log(`\n${KEYS.length} reels gerados em ${path.relative(ROOT, REEL_DIR)}.`);
}

await main();
