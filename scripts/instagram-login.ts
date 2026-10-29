import { chromium } from "playwright";

import { instagramSessionPath, saveInstagramSession } from "@/lib/instagram-browser/session";

/**
 * Login manual no Instagram (grokbot-style).
 *
 * Abre um Chromium headed; você entra na conta normalmente (senha, 2FA).
 * Ao detectar a página inicial, salvamos o `storageState` (cookies) em
 * `INSTAGRAM_SESSION_FILE` para o worker reutilizar sem novo login.
 *
 * Uso: `pnpm instagram:login`
 */
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded" });
  console.log("Entre na conta no navegador aberto (senha/2FA).");
  console.log("Aguardando a página inicial do Instagram…");

  await page.waitForURL(
    (url) => url.hostname === "www.instagram.com" && !url.pathname.startsWith("/accounts/login"),
    { timeout: 10 * 60 * 1000 },
  );

  const state = await context.storageState();
  await saveInstagramSession(state);
  console.log(`Sessão salva em ${instagramSessionPath()}`);
  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
