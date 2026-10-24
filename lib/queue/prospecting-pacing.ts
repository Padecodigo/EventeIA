/**
 * Pacing humanizado do Agente Orçamentista (Regra 1):
 * intervalo ALEATÓRIO de 45–90s entre disparos por instância de WhatsApp.
 * Módulo puro — sem I/O, sem "server-only", testável.
 */

export const MIN_INTERVAL_SECONDS = 45;
export const MAX_INTERVAL_SECONDS = 90;

/** Resolve o intervalo configurado com clamp [45, 90]. */
export function resolveIntervalSeconds(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 60;
  }
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(raw)));
}

/** Sorteia o próximo intervalo humanizado (45–90s). Injeta rand para testes. */
export function pickIntervalSeconds(rand: () => number = Math.random): number {
  return (
    MIN_INTERVAL_SECONDS + Math.floor(rand() * (MAX_INTERVAL_SECONDS - MIN_INTERVAL_SECONDS + 1))
  );
}

/** Armazenamento atômico do pacing (Redis SET NX PX em produção; fake em testes). */
export interface PacingStore {
  /** Grava a chave somente se ausente, com TTL em ms. true = reservou. */
  setIfAbsent(key: string, ttlMs: number): Promise<boolean>;
  /** TTL restante em ms (≤ 0 quando ausente/expirada). */
  ttlMs(key: string): Promise<number>;
}

export function pacingKey(instance: string): string {
  return `eventeia:prospect-pace:${instance}`;
}

export type PacingDecision =
  | { allowed: true; intervalSeconds: number }
  | { allowed: false; retryAtMs: number };

/**
 * Reserva atômica do próximo envio POR INSTÂNCIA: só um job por instância
 * ganha a janela; os demais são adiados até o fim do intervalo (+ jitter),
 * sem bloquear as outras instâncias (≈100 sessões em paralelo).
 */
export async function reservePacingSlot(
  store: PacingStore,
  instance: string,
  nowMs: number,
  rand: () => number = Math.random,
): Promise<PacingDecision> {
  const intervalSeconds = pickIntervalSeconds(rand);
  const reserved = await store.setIfAbsent(pacingKey(instance), intervalSeconds * 1000);
  if (reserved) {
    return { allowed: true, intervalSeconds };
  }
  const remaining = Math.max(1_000, await store.ttlMs(pacingKey(instance)));
  const jitterMs = Math.floor(rand() * 5_000);
  return { allowed: false, retryAtMs: nowMs + remaining + jitterMs };
}
