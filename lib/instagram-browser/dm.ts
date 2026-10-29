import "server-only";

import { logger } from "@/lib/logger";

import { withInstagramBrowser } from "./client";

/** Envia uma DM no Instagram via sessão logada (grokbot-style). */

export interface SendDmWithBrowserInput {
  /** @handle do destinatário (sem arroba). */
  handle: string;
  message: string;
}

export type SendDmWithBrowserResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendDmWithBrowser(input: SendDmWithBrowserInput): Promise<SendDmWithBrowserResult> {
  const handle = input.handle.replace(/^@/, "").trim();
  if (handle.length === 0) return { ok: false, error: "handle vazio" };

  try {
    return await withInstagramBrowser(async ({ context }) => {
      const page = await context.newPage();
      await page.goto(`https://www.instagram.com/${handle}/`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      // Abre a conversa: botão "Message"/"Mensagem" ou link direct.
      const openers = [
        page.getByRole("button", { name: /message|mensagem/i }).first(),
        page.getByRole("link", { name: /message|mensagem/i }).first(),
        page.locator('a[href*="/direct/t/"]').first(),
      ];
      let opened = false;
      for (const opener of openers) {
        if ((await opener.count()) > 0) {
          await opener.click({ timeout: 10_000 }).catch(() => undefined);
          opened = true;
          break;
        }
      }
      if (!opened) return { ok: false, error: "botão de mensagem não encontrado" };

      // Campo de texto da DM.
      const box = page
        .locator('div[role="textbox"][contenteditable="true"], textarea[placeholder*="mensagem" i], textarea[placeholder*="message" i]')
        .first();
      await box.waitFor({ state: "visible", timeout: 30_000 });
      await box.click();
      await box.fill(input.message).catch(async () => {
        await page.keyboard.type(input.message, { delay: 5 });
      });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4_000);

      return { ok: true };
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "sendDmWithBrowser falhou",
    );
    return { ok: false, error: caught instanceof Error ? caught.message : "falha no navegador" };
  }
}
