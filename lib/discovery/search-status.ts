import "server-only";

import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  DEFAULT_SERPER_MIN_CREDITS,
  type SearchStatus,
  type SearchStatusStore,
} from "./providers/search-fallback";

export const SEARCH_STATUS_KEY = "eventeia:search-provider";

/** Provedor de busca ativo (Serper ou DeepSeek Search) + motivo — lido pelo admin. */
export function createRedisSearchStatusStore(): SearchStatusStore {
  return {
    async get() {
      const raw = await getRedisConnection().get(SEARCH_STATUS_KEY);
      return raw === null ? null : (JSON.parse(raw) as SearchStatus);
    },
    async set(s) {
      await getRedisConnection().set(SEARCH_STATUS_KEY, JSON.stringify(s));
    },
  };
}

export async function readSearchStatus(): Promise<SearchStatus | null> {
  try {
    return await createRedisSearchStatusStore().get();
  } catch {
    return null;
  }
}

/** Créditos restantes do Serper: o saldo já consultado (provider_balances, atualizado pelo cheque de saldos). */
export async function serperCreditsFromBalances(): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("provider_balances")
    .select("raw_balance,raw_currency")
    .eq("provider", "serper")
    .maybeSingle();
  if (data?.raw_currency !== "credits" || data.raw_balance === null) return null;
  const n = Number(data.raw_balance);
  return Number.isFinite(n) ? n : null;
}

export function serperMinCredits(): number {
  const n = Number(process.env.SERPER_MIN_CREDITS);
  return Number.isFinite(n) &&
    n >= 0 &&
    process.env.SERPER_MIN_CREDITS !== undefined &&
    process.env.SERPER_MIN_CREDITS !== ""
    ? n
    : DEFAULT_SERPER_MIN_CREDITS;
}

export function logSearchSwitch(s: SearchStatus): void {
  logger.warn(
    { active: s.active, cause: s.cause, reason: s.reason },
    "busca de fornecedores trocou de provedor",
  );
}
