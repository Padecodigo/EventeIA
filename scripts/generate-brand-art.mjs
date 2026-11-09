/**
 * Artes verticais da EventeIA no padrão editorial (referência dos posts 1080×1350):
 *   - STORY       public/brand/stories/{key}.jpg       — 9:16, 1080×1920
 *   - QUADRO REEL public/brand/reel-frames/{key}.jpg  — 9:16, texto no recorte central
 *
 * Os posts de feed (public/brand/posts) são o conjunto canônico 1080×1350
 * restaurado de 7bf6f98. Este script não os regrava: o recorte da foto foi
 * fechado naquele conjunto e o chip de logo (7df7e97) não volta.
 *
 * Determinístico: mesma entrada, mesmas fontes e o mesmo Chrome produzem a mesma saída.
 * Uso: `node scripts/generate-brand-art.mjs` (ou `pnpm brand:art`).
 */
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORY_DIR = path.join(ROOT, "public", "brand", "stories");
const REEL_FRAME_DIR = path.join(ROOT, "public", "brand", "reel-frames");
const FONTS = path.join(ROOT, "app", "fonts");

/** Foto base + título público por tipo de evento. O foco preserva o assunto no 9:16. */
const EVENTS = [
  {
    key: "infantil",
    title: "Festa infantil",
    photo: "public/img/eventos/festa-infantil-velas.jpg",
    focus: "center 30%",
  },
  {
    key: "aniversario",
    title: "Aniversário",
    photo: "public/festa-aniversario.jpg",
    focus: "center 28%",
  },
  {
    key: "casamento",
    title: "Casamento",
    photo: "public/img/eventos/casamento.jpg",
    focus: "center 40%",
  },
  {
    key: "15-anos",
    title: "15 anos",
    photo: "public/img/eventos/15-anos.jpg",
    focus: "center 34%",
  },
  {
    key: "formatura",
    title: "Formatura",
    photo: "public/img/eventos/festa-formatura-baile.jpg",
    focus: "center 20%",
  },
  {
    key: "corporativo",
    title: "Corporativo",
    photo: "public/img/eventos/corporativo.webp",
    focus: "center 42%",
  },
];

/**
 * Story: respiro para a barra do Instagram (topo ~14%, base ~20%).
 * Reel: o título sobe para caber no quadrado central do grid, sem cortar o texto.
 */
const FORMATS = {
  story: {
    dir: STORY_DIR,
    width: 1080,
    height: 1920,
    top: 248,
    side: 72,
    bottom: 360,
    mark: 92,
    word: 46,
    tag: 15,
    kicker: 22,
    title: 84,
    cta: 30,
    divider: 120,
    shade:
      "linear-gradient(180deg, rgba(42,17,25,.34) 0%, rgba(42,17,25,.08) 16%, rgba(42,17,25,0) 30%, rgba(42,17,25,0) 52%, rgba(42,17,25,.55) 70%, rgba(42,17,25,.94) 86%, #2A1119 100%)",
  },
  reel: {
    dir: REEL_FRAME_DIR,
    width: 1080,
    height: 1920,
    top: 188,
    side: 80,
    bottom: 430,
    mark: 96,
    word: 48,
    tag: 16,
    kicker: 24,
    title: 92,
    cta: 32,
    divider: 128,
    shade:
      "linear-gradient(180deg, rgba(42,17,25,.32) 0%, rgba(42,17,25,.06) 14%, rgba(42,17,25,0) 28%, rgba(42,17,25,0) 40%, rgba(42,17,25,.5) 58%, rgba(42,17,25,.92) 78%, #2A1119 100%)",
  },
};

const WINE = "#2A1119";
const GOLD = "#D4AF37";
const PAPER = "#FFFDFA";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} saiu com ${String(code)}: ${stderr.slice(-600)}`));
    });
  });
}

function artHtml({ event, format, fonts, photoUrl }) {
  const f = format;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<style>
@font-face{font-family:Fraunces;src:url("data:font/woff2;base64,${fonts.fraunces}") format("woff2");font-weight:100 900;font-display:block}
@font-face{font-family:Figtree;src:url("data:font/woff2;base64,${fonts.figtree}") format("woff2");font-weight:300 900;font-display:block}
*{box-sizing:border-box;margin:0}
html,body{width:${f.width}px;height:${f.height}px;overflow:hidden;background:${WINE}}
.art{position:relative;width:${f.width}px;height:${f.height}px;overflow:hidden;color:${PAPER}}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${event.focus}}
.shade{position:absolute;inset:0;background:${f.shade}}
.top{position:absolute;top:${f.top}px;left:${f.side}px;right:${f.side}px;display:flex;align-items:center;gap:18px}
.mark{width:${f.mark}px;height:${f.mark}px;border-radius:20px;background:${GOLD};color:${WINE};display:flex;align-items:center;justify-content:center;font-family:Fraunces,Georgia,serif;font-weight:560;font-size:${Math.round(f.mark * 0.58)}px;line-height:1;padding-bottom:6px;flex:none}
.word{font-family:Fraunces,Georgia,serif;font-weight:560;font-size:${f.word}px;letter-spacing:-0.02em;line-height:1}
.word span{color:${GOLD}}
.tag{margin-top:8px;font-family:Figtree,sans-serif;font-weight:600;font-size:${f.tag}px;letter-spacing:.18em;text-transform:uppercase;line-height:1.35}
.bottom{position:absolute;left:${f.side}px;right:${f.side}px;bottom:${f.bottom}px}
.kicker{font-family:Figtree,sans-serif;font-weight:700;font-size:${f.kicker}px;letter-spacing:.28em;text-transform:uppercase;color:${GOLD}}
.h1{margin-top:16px;font-family:Fraunces,Georgia,serif;font-weight:560;font-size:${f.title}px;line-height:1.02;letter-spacing:-0.02em}
.divider{width:${f.divider}px;height:2px;background:${GOLD};margin:22px 0 20px}
.cta{font-family:Figtree,sans-serif;font-weight:500;font-size:${f.cta}px;line-height:1.35}
.cta strong{color:${GOLD};font-weight:700}
</style></head><body>
<div class="art">
  <img class="photo" alt="" src="${photoUrl}"/>
  <div class="shade"></div>
  <div class="top">
    <div class="mark">E</div>
    <div>
      <div class="word">Evente<span>IA</span></div>
      <div class="tag">Você imagina. A EventeIA faz acontecer.</div>
    </div>
  </div>
  <div class="bottom">
    <div class="kicker">Novo evento</div>
    <div class="h1">${escapeHtml(event.title)}</div>
    <div class="divider"></div>
    <div class="cta">Comente <strong>COTAÇÃO</strong> e receba o briefing.</div>
  </div>
</div>
</body></html>`;
}

/** Binário do Chrome, sem o wrapper que injeta remote-debugging e trava o screenshot. */
function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // próximo candidato
    }
  }
  return "google-chrome";
}

async function screenshot(htmlPath, pngPath, width, height, profile) {
  await run(chromeBinary(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--virtual-time-budget=5000",
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ]);
}

async function toJpeg(pngPath, jpgPath) {
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    pngPath,
    "-q:v",
    "2",
    jpgPath,
  ]);
}

async function assertSize(jpgPath, width, height) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    jpgPath,
  ]);
  const [w, h] = stdout
    .trim()
    .split(",")
    .map((n) => Number(n));
  if (w !== width || h !== height) {
    throw new Error(`${path.basename(jpgPath)} saiu ${w}x${h}, esperado ${width}x${height}`);
  }
}

async function main() {
  await mkdir(STORY_DIR, { recursive: true });
  await mkdir(REEL_FRAME_DIR, { recursive: true });
  const fonts = {
    fraunces: (await readFile(path.join(FONTS, "Fraunces.woff2"))).toString("base64"),
    figtree: (await readFile(path.join(FONTS, "Figtree.woff2"))).toString("base64"),
  };
  const work = await mkdtemp(path.join(tmpdir(), "eventeia-art-"));
  const profile = await mkdtemp(path.join(tmpdir(), "eventeia-chrome-"));
  try {
    for (const event of EVENTS) {
      const photoUrl = `file://${path.join(ROOT, event.photo)}`;
      for (const [name, format] of Object.entries(FORMATS)) {
        const htmlPath = path.join(work, `${event.key}-${name}.html`);
        const pngPath = path.join(work, `${event.key}-${name}.png`);
        const jpgPath = path.join(format.dir, `${event.key}.jpg`);
        await writeFile(htmlPath, artHtml({ event, format, fonts, photoUrl }));
        await screenshot(htmlPath, pngPath, format.width, format.height, profile);
        await toJpeg(pngPath, jpgPath);
        await assertSize(jpgPath, format.width, format.height);
        console.log(`✓ ${event.key} (${name}): ${format.width}x${format.height}`);
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
  console.log(`\n${EVENTS.length * Object.keys(FORMATS).length} artes verticais geradas.`);
}

await main();
