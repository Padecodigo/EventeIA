import "server-only";

import type { LlmUsageStore } from "@/lib/discovery/providers/fallback";
import { serverEnv } from "@/lib/env";
import { deepseekCost, microUsdToBrlCents } from "@/lib/finance/pricing";
import { cachedPricesSync, currentFxMicro } from "@/lib/finance/runtime";
import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { defaultStageForTask } from "@/lib/usage/stages";

import { createMockLlmClient, createOpenAiCompatibleClient } from "./clients";
import {
  createRouter,
  type LlmClient,
  type LlmProviderName,
  type PriceTable,
  type Router,
  type UsageLedger,
} from "./router";

const PROVIDERS: LlmProviderName[] = ["nim", "grok", "deepseek"];
const costKey = (p: LlmProviderName) => `eventeia:llm-cost:${p}`;

/** Contadores acumulados no Redis (rápidos, checados antes de cada chamada) + auditoria no Postgres. */
export function createRedisLedger(): UsageLedger {
  const redis = getRedisConnection();
  return {
    async totals() {
      const values = await redis.mget(...PROVIDERS.map(costKey));
      const costByProvider: Partial<Record<LlmProviderName, number>> = {};
      PROVIDERS.forEach((p, i) => (costByProvider[p] = Number(values[i] ?? "0")));
      return { costByProvider };
    },
    async record(e) {
      await redis.incrby(costKey(e.provider), e.costMicroUsd);
      const fx = await currentFxMicro().catch(() => null);
      const { error } = await getSupabaseAdmin()
        .from("llm_usage_events")
        .insert({
          provider: e.provider,
          task: e.task,
          input_tokens: e.inputTokens,
          output_tokens: e.outputTokens,
          cost_micro_usd: e.costMicroUsd,
          outcome: e.outcome,
          cache_hit_tokens: e.cacheHitTokens ?? 0,
          peak: e.peak ?? null,
          event_id: e.eventId ?? null,
          reason: e.reason ?? null,
          profile_id: e.profileId ?? null,
          stage: e.stage ?? defaultStageForTask(e.task),
          whatsapp_channel: e.channel ?? null,
          fx_brl_per_usd_micro: fx,
          cost_brl_cents: fx === null ? null : microUsdToBrlCents(e.costMicroUsd, fx),
        });
      if (error !== null) logger.warn({ code: error.code }, "falha ao auditar uso de LLM");
    },
  };
}

export function priceTableFromEnv(env = serverEnv()): PriceTable {
  return {
    nim: { inPer1M: env.AI_PRICE_NIM_IN_PER_1M, outPer1M: env.AI_PRICE_NIM_OUT_PER_1M },
    grok: { inPer1M: env.AI_PRICE_GROK_IN_PER_1M, outPer1M: env.AI_PRICE_GROK_OUT_PER_1M },
    deepseek: {
      inPer1M: env.AI_PRICE_DEEPSEEK_IN_PER_1M,
      outPer1M: env.AI_PRICE_DEEPSEEK_OUT_PER_1M,
    },
  };
}

let cached: Router | null = null;

/** Roteador de produção (null se nenhuma chave estiver configurada). */
export function getRouter(): Router | null {
  if (cached !== null) return cached;
  // Testes nunca chamam APIs reais.
  if (process.env.NODE_ENV === "test") return null;
  const env = serverEnv();
  const clients: LlmClient[] = [];
  // DeepSeek = cérebro primário (ordem dos clientes não importa; providerOrder decide).
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (process.env.DEEPSEEK_MOCK === "1") {
    clients.push(createMockLlmClient("deepseek")); // simulação: zero custo, zero rede
  } else if (env.AI_USE_DEEPSEEK && deepseekKey !== undefined && deepseekKey !== "") {
    clients.push(
      createOpenAiCompatibleClient({
        name: "deepseek",
        apiKey: deepseekKey,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        model: process.env.DEEPSEEK_MODEL,
        onWarn: (info, msg) => logger.warn(info, msg),
      }),
    );
  }
  if (env.NVIDIA_NIM_API_KEY !== undefined && env.NVIDIA_NIM_API_KEY !== "") {
    clients.push(
      createOpenAiCompatibleClient({
        name: "nim",
        apiKey: env.NVIDIA_NIM_API_KEY,
        model: env.NIM_MODEL,
      }),
    );
  }
  if (env.XAI_API_KEY !== undefined && env.XAI_API_KEY !== "") {
    clients.push(
      createOpenAiCompatibleClient({ name: "grok", apiKey: env.XAI_API_KEY, model: env.XAI_MODEL }),
    );
  }
  if (clients.length === 0) return null;
  cached = createRouter({
    clients,
    ledger: createRedisLedger(),
    prices: priceTableFromEnv(env),
    // DeepSeek: custo real por chamada (pico/fora de pico, cache hit/miss) a partir do usage da API.
    cost: (provider, usage, at) => {
      if (provider !== "deepseek") return null;
      return deepseekCost(
        {
          cacheHitTokens: usage.cacheHitTokens,
          cacheMissTokens: Math.max(0, usage.inputTokens - usage.cacheHitTokens),
          outputTokens: usage.outputTokens,
        },
        at,
        cachedPricesSync(),
      );
    },
    cap: { switchPct: env.XAI_USAGE_SWITCH_PCT, bootstrapMicroUsd: env.AI_GROK_BOOTSTRAP_MICROUSD },
    onAttemptFailure: (info) =>
      logger.warn(info, "LLM: tentativa falhou — tentando próximo provedor"),
    onCapAlert: (info) =>
      logger.warn(info, "ALERTA: Grok no teto de custo — forçando DeepSeek/NIM/contingência"),
  });
  return cached;
}

/**
 * Adaptador para a descoberta: a busca ao vivo do Grok conta no MESMO teto de 25% do custo.
 * Teto atingido ⇒ "esgotado" ⇒ o roteador da descoberta cai para Overpass + NIM.
 */
export function createRouterUsageStore(router: Router, perCallMicroUsd: number): LlmUsageStore {
  let exhausted = false;
  return {
    callsToday: () => Promise.resolve(0),
    async recordCall() {
      await router.record({
        provider: "grok",
        task: "discovery_search",
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: perCallMicroUsd,
        outcome: "ok",
        stage: "discovery",
      });
    },
    async isExhausted() {
      return exhausted || !(await router.grokAllowed(perCallMicroUsd));
    },
    markExhausted() {
      exhausted = true;
      return Promise.resolve();
    },
  };
}
