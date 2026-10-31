import { CLICK_TO_DIRECT_WINDOW_DAYS, MESSAGING_WINDOW_HOURS } from "@/lib/meta/limits";

/**
 * Janelas de resposta da Meta para conversas de fornecedor — valores confirmados
 * em `lib/meta/limits.ts`. Funções puras: recebem "agora"/"origem" por parâmetro.
 */

export type WindowKind = "standard_24h" | "ad_7d";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const WINDOW_DURATION_MS: Record<WindowKind, number> = {
  standard_24h: MESSAGING_WINDOW_HOURS * HOUR_MS,
  ad_7d: CLICK_TO_DIRECT_WINDOW_DAYS * DAY_MS,
};

/** Instante (exclusivo) em que a janela fecha, a partir da última entrada. */
export function windowExpiresAt(kind: WindowKind, at: Date): Date {
  return new Date(at.getTime() + WINDOW_DURATION_MS[kind]);
}

/**
 * Mapeia a origem do referral (campo `source` do webhook) para a janela de
 * resposta. Anúncio Click-to-Direct ("ADS") abre 7 dias; qualquer outra origem
 * (shortlink, ref, plugin) usa a janela padrão de 24h.
 */
export function windowKindFromReferral(source: string | null | undefined): WindowKind {
  return source !== null && source !== undefined && source.toUpperCase() === "ADS" ? "ad_7d" : "standard_24h";
}

/** `ref` codifica o evento no formato `event:<uuid>`; null quando não há evento. */
export function eventIdFromRef(ref: string | null | undefined): string | null {
  if (ref === null || ref === undefined) return null;
  const match = /^event:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(ref.trim());
  return match !== null ? match[1].toLowerCase() : null;
}
