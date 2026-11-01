import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery } from "./types";
import type { SupplierCandidate } from "../pure";

/** Contador de uso do provedor primário (Redis em produção, memória nos testes). */
export interface LlmUsageStore {
  callsToday(): Promise<number>;
  recordCall(): Promise<void>;
  isExhausted(): Promise<boolean>;
  markExhausted(): Promise<void>;
}

/** Troca para o fallback quando o uso do dia passa de `switchPct`% do orçamento, ou a cota acabou. */
export function shouldUseFallback(input: {
  callsToday: number;
  dailyBudget: number;
  switchPct: number;
  exhausted: boolean;
}): boolean {
  if (input.exhausted) return true;
  return input.callsToday >= (input.dailyBudget * input.switchPct) / 100;
}

export function createMemoryUsageStore(): LlmUsageStore {
  let calls = 0;
  let exhausted = false;
  return {
    callsToday: () => Promise.resolve(calls),
    recordCall: () => {
      calls += 1;
      return Promise.resolve();
    },
    isExhausted: () => Promise.resolve(exhausted),
    markExhausted: () => {
      exhausted = true;
      return Promise.resolve();
    },
  };
}

/** Roteador Grok → NIM. O nome continua "grok" (para caps); `lastUsed` diz quem atendeu. */
export function createFallbackProvider(options: {
  primary: DiscoveryProvider;
  fallback: DiscoveryProvider;
  usage: LlmUsageStore;
  dailyBudget: number;
  switchPct: number;
}): DiscoveryProvider {
  const router: DiscoveryProvider & { lastUsed: string } = {
    name: options.primary.name,
    lastUsed: options.primary.name,
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const useFallback = shouldUseFallback({
        callsToday: await options.usage.callsToday(),
        dailyBudget: options.dailyBudget,
        switchPct: options.switchPct,
        exhausted: await options.usage.isExhausted(),
      });
      if (!useFallback) {
        router.lastUsed = options.primary.name;
        try {
          await options.usage.recordCall();
          return await options.primary.search(query);
        } catch (error) {
          if (!(error instanceof ProviderQuotaError)) throw error;
          await options.usage.markExhausted();
        }
      }
      router.lastUsed = options.fallback.name;
      return options.fallback.search(query);
    },
  };
  return router;
}
