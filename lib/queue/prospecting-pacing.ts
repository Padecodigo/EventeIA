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
