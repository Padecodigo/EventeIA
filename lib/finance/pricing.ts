import { z } from "zod";

/**
 * Preços em micro-USD (US$ 1 = 1_000_000). Inteiros SEMPRE; arredondamento só no fim.
 * DeepSeek deepseek-flash (DeepSeek-V4.1-Flash-1017), por 1M tokens, fora de pico / pico.
 */
export const PRICE_KEYS = [
  "deepseek.in_hit.offpeak",
  "deepseek.in_miss.offpeak",
  "deepseek.out.offpeak",
  "deepseek.in_hit.peak",
  "deepseek.in_miss.peak",
  "deepseek.out.peak",
  "search.per_1k",
  "fetch.per_1k",
  "serper.per_1k",
  "google_places.per_1k",
  "resend.per_1k",
  "whatsapp_cloud.per_1k",
  "evolution.per_1k",
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];
export type FinancePrices = Record<PriceKey, number>;

export const DEFAULT_FINANCE_PRICES: FinancePrices = {
  "deepseek.in_hit.offpeak": 3_000,
  "deepseek.in_miss.offpeak": 150_000,
  "deepseek.out.offpeak": 600_000,
  "deepseek.in_hit.peak": 6_000,
  "deepseek.in_miss.peak": 300_000,
  "deepseek.out.peak": 1_200_000,
  "search.per_1k": 750_000,
  "fetch.per_1k": 750_000,
  // Serper: US$ 50 / 50k créditos (plano inicial) ≈ US$ 1,00 por 1000 buscas.
  "serper.per_1k": 1_000_000,
  // Google Places Text Search (New) com telefone/site (SKU Enterprise) ≈ US$ 35 por 1000.
  "google_places.per_1k": 35_000_000,
  // Resend: plano gratuito (3k/mês) = 0; ajuste no painel se assinar (Pro ≈ US$ 0,40/1000).
  "resend.per_1k": 0,
  // WhatsApp Cloud API (template de utilidade, Brasil) ≈ US$ 0,008 por mensagem.
  "whatsapp_cloud.per_1k": 8_000_000,
  // Evolution (WhatsApp do cliente, self-hosted): sem custo por mensagem (custo fixo da VPS).
  "evolution.per_1k": 0,
};

/** Chaves cobradas por requisição/unidade (preço por 1000). */
export type RequestPriceKind = "search" | "fetch" | "serper" | "google_places" | "resend" | "whatsapp_cloud" | "evolution";

const overrideSchema = z.record(z.string(), z.number().int().min(0).max(1_000_000_000));
const keySchema = z.enum(PRICE_KEYS);

/** Prioridade: tabela do admin (pricing_rates) > env FINANCE_PRICES_JSON > padrão documentado. */
export function resolvePrices(envJson: string | undefined, rows: readonly { key: string; micro_usd: number }[] = []): FinancePrices {
  const out: FinancePrices = { ...DEFAULT_FINANCE_PRICES };
  if (envJson !== undefined && envJson.trim() !== "") {
    let raw: unknown;
    try {
      raw = JSON.parse(envJson);
    } catch {
      raw = {};
    }
    const parsed = overrideSchema.safeParse(raw);
    if (parsed.success) {
      for (const [k, v] of Object.entries(parsed.data)) {
        const key = keySchema.safeParse(k);
        if (key.success) out[key.data] = v;
      }
    }
  }
  for (const r of rows) {
    const key = keySchema.safeParse(r.key);
    if (key.success && Number.isSafeInteger(r.micro_usd) && r.micro_usd >= 0) out[key.data] = r.micro_usd;
  }
  return out;
}

/** Pico DeepSeek: seg–sex, 01:00–04:00 e 06:00–10:00 UTC (fim exclusivo). */
export function isDeepseekPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = at.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

function divRoundHalfUp(n: bigint, d: bigint): number {
  return Number((n * 2n + d) / (2n * d));
}

export interface DeepseekUsage {
  /** prompt_cache_hit_tokens */
  cacheHitTokens: number;
  /** prompt_cache_miss_tokens (se a API não informar: prompt_tokens − hit) */
  cacheMissTokens: number;
  outputTokens: number;
}

export function deepseekCost(usage: DeepseekUsage, at: Date, prices: FinancePrices = DEFAULT_FINANCE_PRICES): { costMicroUsd: number; peak: boolean } {
  const peak = isDeepseekPeak(at);
  const t = peak ? "peak" : "offpeak";
  const sum =
    BigInt(usage.cacheHitTokens) * BigInt(prices[`deepseek.in_hit.${t}`]) +
    BigInt(usage.cacheMissTokens) * BigInt(prices[`deepseek.in_miss.${t}`]) +
    BigInt(usage.outputTokens) * BigInt(prices[`deepseek.out.${t}`]);
  return { costMicroUsd: divRoundHalfUp(sum, 1_000_000n), peak };
}

/** Search/Fetch: US$ 0,75 por 1000 requisições BEM-SUCEDIDAS. */
export function requestsCost(kind: RequestPriceKind, successfulRequests: number, prices: FinancePrices = DEFAULT_FINANCE_PRICES): number {
  return divRoundHalfUp(BigInt(Math.max(0, successfulRequests)) * BigInt(prices[`${kind}.per_1k`]), 1_000n);
}

/** micro-USD → centavos de BRL com câmbio gravado (micro-BRL por US$ 1). */
export function microUsdToBrlCents(microUsd: number, brlPerUsdMicro: number): number {
  return divRoundHalfUp(BigInt(microUsd) * BigInt(brlPerUsdMicro), 10_000_000_000n);
}

export function microUsdToUsdCents(microUsd: number): number {
  return divRoundHalfUp(BigInt(microUsd), 10_000n);
}

/** "5,60" → 5_600_000 micro-BRL por US$. */
export function parseFxToMicro(input: string): number | null {
  const m = /^\s*(\d{1,3})(?:[.,](\d{1,6}))?\s*$/.exec(input);
  if (m === null) return null;
  const v = Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0"));
  return v > 0 ? v : null;
}

export const DEFAULT_FX_BRL_PER_USD_MICRO = 5_600_000;
