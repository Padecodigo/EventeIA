import { createHash } from "node:crypto";

/**
 * Deduplicação de mídia do autopilot — pura e determinística (sem I/O).
 * Garante que a mesma imagem nunca seja publicada duas vezes: o FLUX usa o
 * hash do conteúdo (identidade global) e o fallback estático usa uma janela
 * recente (o mesmo asset só pode ser reutilizado depois de 24h).
 */

/** Janela de reutilização do fallback estático (24h). */
export const STATIC_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Tentativas máximas de regenerar o FLUX quando há colisão de conteúdo. */
export const FLUX_MAX_RETRIES = 3;

export interface MediaUse {
  key: string;
  usedAtMs: number;
}

/** Chave de deduplicação de um asset estático (fallback), distinta do hash. */
export function staticMediaKey(path: string): string {
  return `static:${path}`;
}

/** SHA-256 hex do conteúdo da imagem — identidade deduplicada do FLUX. */
export function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Devolve o primeiro candidato cuja chave ainda não foi usada dentro da janela
 * recente; `null` quando todos os candidatos foram usados recentemente.
 */
export function pickFirstUnusedRecently<T>(
  candidates: readonly T[],
  uses: readonly MediaUse[],
  keyOf: (item: T) => string,
  windowMs: number,
  nowMs: number,
): T | null {
  for (const candidate of candidates) {
    const key = keyOf(candidate);
    const used = uses.some((use) => use.key === key && nowMs - use.usedAtMs < windowMs);
    if (!used) return candidate;
  }
  return null;
}
