import "server-only";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Page } from "playwright";

import { logger } from "@/lib/logger";

import { withInstagramBrowser } from "./client";

/** Publica uma foto no Instagram via sessão logada (grokbot-style). */

export interface PublishWithBrowserInput {
  /** URL pública da imagem (baixada para um arquivo temporário). */
  imageUrl: string;
  caption: string;
}

export type PublishWithBrowserResult =
  | { ok: true; permalink: string | null }
  | { ok: false; error: string };

const IG_HOME = "https://www.instagram.com/";

async function downloadToTemp(imageUrl: string): Promise<{ dir: string; file: string }> {
  const response = await fetch(imageUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`download da imagem falhou (${String(response.status)})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), "ev-ig-"));
  const file = join(dir, "post.jpg");
  await writeFile(file, bytes);
  return { dir, file };
}

async function clickFirst(page: Page, selectors: Array<{ role: "button" | "link"; name: RegExp }>): Promise<boolean> {
  for (const sel of selectors) {
    const loc = page.getByRole(sel.role, { name: sel.name }).first();
    if ((await loc.count()) > 0) {
      await loc.click({ timeout: 10_000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

export async function publishWithBrowser(input: PublishWithBrowserInput): Promise<PublishWithBrowserResult> {
  let temp: { dir: string; file: string } | null = null;
  try {
    const downloaded = await downloadToTemp(input.imageUrl);
    temp = downloaded;

    return await withInstagramBrowser(async ({ context }) => {
      const page = await context.newPage();
      await page.goto(IG_HOME, { waitUntil: "domcontentloaded", timeout: 60_000 });

      // 1) abre o fluxo de criação
      const opened =
        (await clickFirst(page, [
          { role: "link", name: /create|nova publica/i },
          { role: "button", name: /create|nova publica/i },
        ])) ||
        (await page.locator('svg[aria-label="New post"], svg[aria-label="Nova publicação"]').first().click({ timeout: 10_000 }).then(() => true).catch(() => false));
      if (!opened) return { ok: false, error: "botão de criar post não encontrado (sessão expirada?)" };

      // 2) upload do arquivo
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 30_000 });
      await fileInput.setInputFiles(downloaded.file);

      // 3) avançar (corte + filtro)
      await page.waitForTimeout(2_000);
      await clickFirst(page, [{ role: "button", name: /next|avançar|avancar/i }]);
      await page.waitForTimeout(2_000);
      await clickFirst(page, [{ role: "button", name: /next|avançar|avancar/i }]);

      // 4) legenda (textarea ou contenteditable)
      const captionBox = page.locator('textarea[aria-label*="caption" i], div[contenteditable="true"]').first();
      await captionBox.waitFor({ state: "visible", timeout: 30_000 });
      await captionBox.click();
      await captionBox.fill(input.caption).catch(async () => {
        await page.keyboard.type(input.caption, { delay: 5 });
      });

      // 5) compartilhar
      const shared = await clickFirst(page, [
        { role: "button", name: /share|compartilhar/i },
      ]);
      if (!shared) return { ok: false, error: "botão de compartilhar não encontrado" };

      // 6) espera o link do post
      await page.waitForTimeout(6_000);
      const permalink = /instagram\.com\/(p|reel)\//.test(page.url()) ? page.url() : null;
      return { ok: true, permalink };
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "publishWithBrowser falhou",
    );
    return { ok: false, error: caught instanceof Error ? caught.message : "falha no navegador" };
  } finally {
    if (temp !== null) await rm(temp.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
