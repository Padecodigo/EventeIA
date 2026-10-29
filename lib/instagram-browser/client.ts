import "server-only";

import { chromium, type Browser, type BrowserContext } from "playwright";

import { serverEnv } from "@/lib/env";

import { loadFacebookSession, loadInstagramSession, type SocialPlatform } from "./session";

export interface SocialBrowserHandle {
  browser: Browser;
  context: BrowserContext;
}

/** Alias mantido para o código existente (Instagram). */
export type InstagramBrowserHandle = SocialBrowserHandle;

/** Reduz a pegada de automação (mesmo espírito do grokbot). */
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Abre o Chromium com a sessão logada da plataforma carregada. */
export async function launchBrowser(platform: SocialPlatform = "instagram"): Promise<SocialBrowserHandle> {
  const env = serverEnv();
  const browser = await chromium.launch({
    headless: env.INSTAGRAM_BROWSER_HEADLESS,
    args: STEALTH_ARGS,
  });
  const session = platform === "instagram" ? await loadInstagramSession() : await loadFacebookSession();
  const context = await browser.newContext({
    ...(session !== null ? { storageState: session } : {}),
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  });
  return { browser, context };
}

/** Executa `fn` num browser aberto e sempre fecha no final. */
export async function withBrowser<T>(
  platform: SocialPlatform,
  fn: (handle: SocialBrowserHandle) => Promise<T>,
): Promise<T> {
  const handle = await launchBrowser(platform);
  try {
    return await fn(handle);
  } finally {
    await handle.context.close().catch(() => undefined);
    await handle.browser.close().catch(() => undefined);
  }
}

export function withInstagramBrowser<T>(fn: (handle: SocialBrowserHandle) => Promise<T>): Promise<T> {
  return withBrowser("instagram", fn);
}

export function withFacebookBrowser<T>(fn: (handle: SocialBrowserHandle) => Promise<T>): Promise<T> {
  return withBrowser("facebook", fn);
}
