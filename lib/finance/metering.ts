import "server-only";

import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/types";

import { requestsCost, type RequestPriceKind } from "./pricing";
import { currentPrices, recordCostEntry } from "./runtime";

/** Provedor gravado em cost_entries para cada tipo medido. */
export type CostProvider = Database["public"]["Tables"]["cost_entries"]["Row"]["provider"];

export const PROVIDER_OF: Record<RequestPriceKind, CostProvider> = {
  search: "search",
  fetch: "fetch",
  serper: "serper",
  google_places: "google_places",
  resend: "resend",
  whatsapp_cloud: "whatsapp",
  evolution: "evolution",
};

/**
 * Mede uso por requisição (Serper, Google Places, Resend, WhatsApp) em cost_entries.
 * Fire-and-forget: nunca lança nem atrasa o fluxo principal.
 */
export function meterUsage(kind: RequestPriceKind, reason: string, opts: { quantity?: number; eventId?: string | null } = {}): void {
  const quantity = Math.max(1, Math.floor(opts.quantity ?? 1));
  void (async () => {
    const prices = await currentPrices();
    const cost = requestsCost(kind, quantity, prices);
    await recordCostEntry({
      provider: PROVIDER_OF[kind],
      kind: "variable",
      reason,
      quantity,
      unit_price_micro_usd: Math.round(cost / quantity),
      cost_micro_usd: cost,
      event_id: opts.eventId ?? null,
    });
  })().catch((e: unknown) => logger.warn({ reason: e instanceof Error ? e.message : "?" }, "falha ao medir uso"));
}
