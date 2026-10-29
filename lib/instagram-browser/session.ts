import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BrowserContext } from "playwright";

import { serverEnv } from "@/lib/env";

/**
 * Sessões logadas de redes sociais (grokbot-style): storageState = cookies + origins.
 * Persistidas em arquivo (volume no worker) e reutilizadas pelos jobs.
 */

export type SocialPlatform = "instagram" | "facebook";

/** Mesmo formato retornado por `context.storageState()` (aceito em `newContext`). */
export type SocialStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
/** Alias mantido para compatibilidade com o código existente. */
export type InstagramStorageState = SocialStorageState;

export function instagramSessionPath(): string {
  return serverEnv().INSTAGRAM_SESSION_FILE;
}

export function facebookSessionPath(): string {
  return serverEnv().FACEBOOK_SESSION_FILE;
}

export function socialSessionPath(platform: SocialPlatform): string {
  return platform === "instagram" ? instagramSessionPath() : facebookSessionPath();
}

async function loadFrom(path: string): Promise<SocialStorageState | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<SocialStorageState>;
    if (!Array.isArray(parsed.cookies)) return null;
    return { cookies: parsed.cookies, origins: parsed.origins ?? [] };
  } catch {
    return null;
  }
}

async function saveTo(path: string, session: SocialStorageState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), "utf8");
}

async function clearAt(path: string): Promise<void> {
  await rm(path, { force: true });
}

// --- Instagram ---
export async function loadInstagramSession(): Promise<SocialStorageState | null> {
  return loadFrom(instagramSessionPath());
}

export async function saveInstagramSession(session: SocialStorageState): Promise<void> {
  return saveTo(instagramSessionPath(), session);
}

export async function hasInstagramSession(): Promise<boolean> {
  return (await loadInstagramSession()) !== null;
}

export async function clearInstagramSession(): Promise<void> {
  return clearAt(instagramSessionPath());
}

// --- Facebook ---
export async function loadFacebookSession(): Promise<SocialStorageState | null> {
  return loadFrom(facebookSessionPath());
}

export async function saveFacebookSession(session: SocialStorageState): Promise<void> {
  return saveTo(facebookSessionPath(), session);
}

export async function hasFacebookSession(): Promise<boolean> {
  return (await loadFacebookSession()) !== null;
}

export async function clearFacebookSession(): Promise<void> {
  return clearAt(facebookSessionPath());
}
