import { createDeepseekRefinedProvider } from "./deepseek";
import { createFallbackProvider, createMemoryUsageStore, type LlmUsageStore } from "./fallback";
import { createGrokProvider } from "./grok";
import { createMockProvider } from "./mock";
import { createNimProvider } from "./nim";
import { createOverpassProvider } from "./overpass";
import { createGooglePlacesProvider, createSerperProvider } from "./paid-places";
import { createSocialProvider } from "./social";
import type { DiscoveryProvider, FetchLike } from "./types";

export const KNOWN_PROVIDERS = ["grok", "social", "nim", "overpass", "serper", "google_places", "mock"] as const;

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
  /** Opcionais (pagos): entram DEPOIS do OSM+DeepSeek só quando a chave existe. */
  SERPER_API_KEY?: string;
  GOOGLE_PLACES_API_KEY?: string;
}

/**
 * DISCOVERY_PROVIDERS="grok,overpass,mock" (ordem = prioridade). Sem a variável:
 * grok + social (perfis públicos Instagram/Facebook/TikTok) quando XAI_API_KEY existe, depois overpass e mock. Com NVIDIA_NIM_API_KEY,
 * o grok vira um roteador que troca para o NIM ao passar de XAI_USAGE_SWITCH_PCT%
 * do orçamento diário ou em erro de cota (429/402/403). Sem chave xAI, "grok" vira "nim".
 */
export function resolveProviders(
  env: ProviderEnv,
  fetchImpl?: FetchLike,
  usage: LlmUsageStore = createMemoryUsageStore(),
  onPaidRequest?: (provider: "serper" | "google_places") => void,
): DiscoveryProvider[] {
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
  const refine = (p: DiscoveryProvider): DiscoveryProvider =>
    env.DEEPSEEK_API_KEY !== undefined && env.DEEPSEEK_API_KEY.length > 0
      ? createDeepseekRefinedProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL, model: env.DEEPSEEK_MODEL, source: p, fetchImpl })
      : p;
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
    else if (name === "serper" && env.SERPER_API_KEY) add(refine(createSerperProvider({ apiKey: env.SERPER_API_KEY, fetchImpl, onRequest: onPaidRequest })));
    else if (name === "google_places" && env.GOOGLE_PLACES_API_KEY)
      add(refine(createGooglePlacesProvider({ apiKey: env.GOOGLE_PLACES_API_KEY, fetchImpl, onRequest: onPaidRequest })));
    else if (name === "mock") add(createMockProvider());
  }
  // Sem DISCOVERY_PROVIDERS explícito: provedores pagos com chave entram após o OSM (antes do mock).
  if (env.DISCOVERY_PROVIDERS === undefined || env.DISCOVERY_PROVIDERS.trim().length === 0) {
    const paid: DiscoveryProvider[] = [];
    if (env.SERPER_API_KEY) paid.push(refine(createSerperProvider({ apiKey: env.SERPER_API_KEY, fetchImpl, onRequest: onPaidRequest })));
    if (env.GOOGLE_PLACES_API_KEY) paid.push(refine(createGooglePlacesProvider({ apiKey: env.GOOGLE_PLACES_API_KEY, fetchImpl, onRequest: onPaidRequest })));
    const mockIdx = out.findIndex((p) => p.name === "mock");
    for (const p of paid) {
      if (added.has(p.name)) continue;
      added.add(p.name);
      if (mockIdx >= 0) out.splice(out.findIndex((x) => x.name === "mock"), 0, p);
      else out.push(p);
    }
  }
  return out.length > 0 ? out : [createMockProvider()];
}
