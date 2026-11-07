/**
 * Gera os REELS da EventeIA (vídeo vertical 9:16) a partir das artes de story
 * (que já têm a logo). Determinístico: mesma entrada → mesma saída.
 * Uso: `node scripts/generate-brand-reels.mjs` (ou `pnpm brand:reels`).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORY_DIR = path.join(ROOT, "public", "brand", "stories");
const REEL_DIR = path.join(ROOT, "public", "brand", "reels");

const KEYS = ["infantil", "aniversario", "casamento", "15-anos", "formatura", "corporativo"];

const DURATION = 8; // segundos
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

async function makeReel(key) {
  const input = path.join(STORY_DIR, `${key}.jpg`);
  const output = path.join(REEL_DIR, `${key}.mp4`);
  const args = [
    "-y",
    "-loop", "1",
    "-i", input,
    "-t", String(DURATION),
    "-r", String(FPS),
    "-vf",
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0012,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    "-c:v", "libopenh264",
    "-b:v", "4000k",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ];
  await exec("ffmpeg", args);
  return output;
}

async function main() {
  await mkdir(REEL_DIR, { recursive: true });
  for (const key of KEYS) {
    const out = await makeReel(key);
    console.log(`✓ ${key} -> ${path.relative(ROOT, out)}`);
  }
  console.log(`\n${KEYS.length} reels gerados em ${path.relative(ROOT, REEL_DIR)}.`);
}

await main();
