import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import {
  DEFAULT_FX_BRL_PER_USD_MICRO,
  microUsdToBrlCents,
  resolvePrices,
  type FinancePrices,
} from "./pricing";

const TTL_MS = 10 * 60_000;
let fxCache: { value: number; at: number } | null = null;
let priceCache: { value: FinancePrices; at: number } | null = null;

/** Câmbio mais recente lançado pelo admin (fx_rates); fallback FINANCE_FX_BRL_PER_USD_MICRO/padrão. */
export async function currentFxMicro(): Promise<number> {
  if (fxCache !== null && Date.now() - fxCache.at < TTL_MS) return fxCache.value;
  const envFx = Number(process.env.FINANCE_FX_BRL_PER_USD_MICRO ?? "");
  let value = Number.isSafeInteger(envFx) && envFx > 0 ? envFx : DEFAULT_FX_BRL_PER_USD_MICRO;
  const { data } = await getSupabaseAdmin()
    .from("fx_rates")
    .select("brl_per_usd_micro")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) value = data.brl_per_usd_micro;
  fxCache = { value, at: Date.now() };
  return value;
}

export async function currentPrices(): Promise<FinancePrices> {
  if (priceCache !== null && Date.now() - priceCache.at < TTL_MS) return priceCache.value;
  const { data } = await getSupabaseAdmin().from("pricing_rates").select("key,micro_usd");
  const value = resolvePrices(process.env.FINANCE_PRICES_JSON, data ?? []);
  priceCache = { value, at: Date.now() };
  return value;
}

/** Preços síncronos para o roteador (último cache; padrão/env até o 1º carregamento). */
export function cachedPricesSync(): FinancePrices {
  if (priceCache === null || Date.now() - priceCache.at >= TTL_MS) void currentPrices().catch(() => undefined);
  return priceCache?.value ?? resolvePrices(process.env.FINANCE_PRICES_JSON);
}

type CostInsert = Database["public"]["Tables"]["cost_entries"]["Insert"];

/** Lança um custo variável (search/fetch/whatsapp...) com câmbio gravado. Best-effort. */
export async function recordCostEntry(
  entry: Omit<CostInsert, "fx_brl_per_usd_micro" | "cost_brl_cents"> & { cost_micro_usd: number },
): Promise<void> {
  try {
    const fx = await currentFxMicro();
    const { error } = await getSupabaseAdmin()
      .from("cost_entries")
      .insert({ ...entry, fx_brl_per_usd_micro: fx, cost_brl_cents: microUsdToBrlCents(entry.cost_micro_usd, fx) });
    if (error !== null) logger.warn({ code: error.code }, "falha ao lançar custo");
  } catch (caught) {
    logger.warn({ reason: caught instanceof Error ? caught.message : "?" }, "falha ao lançar custo");
  }
}
