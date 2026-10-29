import "server-only";

import { chromium } from "playwright";

import { logger } from "@/lib/logger";

import { saveInstagramSession } from "./session";

/**
 * Login headless no Instagram a partir do painel admin.
 *
 * Em caso de 2FA/checkpoint o Instagram bloqueia automação: devolvemos erro
 * pedindo o script com tela (`pnpm instagram:login`). Em sucesso, salvamos o
 * storageState para o worker reutilizar.
 */

export type LoginWithBrowserResult = { ok: true } | { ok: false; error: string };

const IG_LOGIN = "https://www.instagram.com/accounts/login/";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export async function loginWithBrowser(input: {
  username: string;
  password: string;
}): Promise<LoginWithBrowserResult> {
  const browser = await chromium.launch({ headless: true, args: STEALTH_ARGS });
  const context = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(IG_LOGIN, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const userInput = page.locator('input[name="username"]').first();
    await userInput.waitFor({ state: "visible", timeout: 30_000 });
    await userInput.fill(input.username);
    await page.locator('input[name="password"]').first().fill(input.password);
    await page.locator('button[type="submit"]').first().click();

    // Espera sair da tela de login (ou estourar o tempo).
    await page
      .waitForURL((url) => !url.pathname.startsWith("/accounts/login"), { timeout: 60_000 })
      .catch(() => undefined);
    await page.waitForTimeout(2_000);

    const url = page.url();
    if (/\/(challenge|two_factor|checkpoint)\//.test(url)) {
      return {
        ok: false,
        error: "Instagram pediu verificação (2FA/checkpoint). Use `pnpm instagram:login` num ambiente com tela.",
      };
    }
    if (url.includes("/accounts/login")) {
      const errorText = await page
        .locator('div[role="alert"], #slfErrorAlert')
        .first()
        .textContent()
        .catch(() => null);
      return { ok: false, error: errorText?.trim() || "Login falhou (usuário/senha ou bloqueio do Instagram)." };
    }

    // Descarta o diálogo "salvar informações de login" (não bloqueia a sessão).
    await page.getByRole("button", { name: /not now|agora não|agora nao/i }).first().click({ timeout: 5_000 }).catch(() => undefined);

    const state = await context.storageState();
    await saveInstagramSession(state);
    return { ok: true };
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "loginWithBrowser falhou",
    );
    return { ok: false, error: caught instanceof Error ? caught.message : "falha no navegador" };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
