import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BrowserContext } from "playwright";

import { serverEnv } from "@/lib/env";

/**
 * Sessão logada do Instagram (grokbot-style): storageState = cookies + origins.
 * Persistida em arquivo (volume no worker) e reutilizada por todos os jobs.
 */

/** Mesmo formato retornado por `context.storageState()` (aceito em `newContext`). */
export type InstagramStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export function instagramSessionPath(): string {
  return serverEnv().INSTAGRAM_SESSION_FILE;
}

/** Lê a sessão salva; `null` se não existir ou estiver inválida. */
export async function loadInstagramSession(): Promise<InstagramStorageState | null> {
  try {
    const raw = await readFile(instagramSessionPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<InstagramStorageState>;
    if (!Array.isArray(parsed.cookies)) return null;
    return { cookies: parsed.cookies, origins: parsed.origins ?? [] };
  } catch {
    return null;
  }
}

/** Salva a sessão (chamado pelo script de login após o login manual). */
export async function saveInstagramSession(session: InstagramStorageState): Promise<void> {
  const path = instagramSessionPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), "utf8");
}

/** Há sessão salva? (não valida expiração — a publish valida na prática). */
export async function hasInstagramSession(): Promise<boolean> {
  return (await loadInstagramSession()) !== null;
}

/** Remove a sessão logada (logout). */
export async function clearInstagramSession(): Promise<void> {
  await rm(instagramSessionPath(), { force: true });
}
