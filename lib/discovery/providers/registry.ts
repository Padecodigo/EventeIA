import { createDeepseekRefinedProvider } from "./deepseek";
import { createFallbackProvider, createMemoryUsageStore, type LlmUsageStore } from "./fallback";
import { createGrokProvider } from "./grok";
import { createMockProvider } from "./mock";
import { createNimProvider } from "./nim";
import { createOverpassProvider } from "./overpass";
import { createSocialProvider } from "./social";
import type { DiscoveryProvider, FetchLike } from "./types";

export const KNOWN_PROVIDERS = ["grok", "social", "nim", "overpass", "mock"] as const;

export interface ProviderEnv {
  DISCOVERY_PROVIDERS?: string;
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  NVIDIA_NIM_API_KEY?: string;
  NIM_MODEL?: string;
  XAI_DAILY_BUDGET?: number;
  XAI_USAGE_SWITCH_PCT?: number;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
}

/**
 * DISCOVERY_PROVIDERS="grok,overpass,mock" (ordem = prioridade). Sem a variável:
 * grok + social (perfis públicos Instagram/Facebook/TikTok) quando XAI_API_KEY existe, depois overpass e mock. Com NVIDIA_NIM_API_KEY,
 * o grok vira um roteador que troca para o NIM ao passar de XAI_USAGE_SWITCH_PCT%
 * do orçamento diário ou em erro de cota (429/402/403). Sem chave xAI, "grok" vira "nim".
 */
export function resolveProviders(env: ProviderEnv, fetchImpl?: FetchLike, usage: LlmUsageStore = createMemoryUsageStore()): DiscoveryProvider[] {
  const hasXai = env.XAI_API_KEY !== undefined && env.XAI_API_KEY.length > 0;
  const hasNim = env.NVIDIA_NIM_API_KEY !== undefined && env.NVIDIA_NIM_API_KEY.length > 0;
  const names =
    env.DISCOVERY_PROVIDERS !== undefined && env.DISCOVERY_PROVIDERS.trim().length > 0
      ? env.DISCOVERY_PROVIDERS.split(",").map((s) => s.trim().toLowerCase())
      : hasXai
        ? ["grok", "social", "overpass", "mock"]
        : hasNim
          ? ["grok", "overpass", "mock"]
        : ["mock"];
  const rawOverpass = createOverpassProvider(fetchImpl);
  // Com DEEPSEEK_API_KEY, o OSM passa pelo DeepSeek (relevância/categoria/nome); sem chave, OSM puro.
  const overpass =
    env.DEEPSEEK_API_KEY !== undefined && env.DEEPSEEK_API_KEY.length > 0
      ? createDeepseekRefinedProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL, model: env.DEEPSEEK_MODEL, source: rawOverpass, fetchImpl })
      : rawOverpass;
  const nim =
    hasNim && env.NVIDIA_NIM_API_KEY !== undefined
      ? createNimProvider({ apiKey: env.NVIDIA_NIM_API_KEY, model: env.NIM_MODEL, sources: [rawOverpass], fetchImpl })
      : null;
  const out: DiscoveryProvider[] = [];
  const added = new Set<string>();
  const add = (p: DiscoveryProvider) => {
    if (!added.has(p.name)) {
      added.add(p.name);
      out.push(p);
    }
  };
  for (const name of new Set(names)) {
    if (name === "grok" && hasXai && env.XAI_API_KEY !== undefined) {
      const grok = createGrokProvider({ apiKey: env.XAI_API_KEY, model: env.XAI_MODEL, fetchImpl });
      add(
        nim !== null
          ? createFallbackProvider({
              primary: grok,
              fallback: nim,
              usage,
              dailyBudget: env.XAI_DAILY_BUDGET ?? 200,
              switchPct: env.XAI_USAGE_SWITCH_PCT ?? 25,
            })
          : grok,
      );
    } else if ((name === "grok" || name === "nim") && nim !== null) add(nim);
    else if (name === "social" && hasXai && env.XAI_API_KEY !== undefined)
      add(createSocialProvider({ apiKey: env.XAI_API_KEY, model: env.XAI_MODEL, fetchImpl }));
    else if (name === "overpass") add(overpass);
    else if (name === "mock") add(createMockProvider());
  }
  return out.length > 0 ? out : [createMockProvider()];
}
