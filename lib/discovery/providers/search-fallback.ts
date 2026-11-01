import { extractBrazilPhones } from "@/lib/phone";

import { dedupeKey, type SupplierCandidate } from "../pure";
import { isSocialProfileUrl, socialCandidates } from "./paid-places";
import {
  ProviderQuotaError,
  queryWhat,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type FetchLike,
} from "./types";

/**
 * Busca de fornecedores: Serper enquanto houver créditos; troca AUTOMÁTICA para a
 * DeepSeek Search API (POST /v1/tools/search, US$ 0,75/1000) quando:
 *  - o saldo de créditos do Serper fica abaixo do mínimo configurável (SERPER_MIN_CREDITS);
 *  - o Serper responde erro de crédito (402/403 ou "not enough credits");
 *  - o Serper está fora do ar (rede/timeout/5xx).
 * Na falha, a MESMA consulta é refeita na DeepSeek. Resultados normalizados para o formato interno.
 */

export type SearchBackend = "serper" | "deepseek_search";

export interface SearchStatus {
  active: SearchBackend;
  reason: string;
  /** "credits" | "low_balance" | "down" | "ok" */
  cause: "ok" | "low_balance" | "credits" | "down";
  at: string;
}

export interface SearchStatusStore {
  get(): Promise<SearchStatus | null>;
  set(status: SearchStatus): Promise<void>;
}

export function createMemorySearchStatusStore(): SearchStatusStore {
  let s: SearchStatus | null = null;
  return {
    get: () => Promise.resolve(s),
    set: (v) => {
      s = v;
      return Promise.resolve();
    },
  };
}

export const DEFAULT_SERPER_MIN_CREDITS = 100;
/** Depois de erro de crédito, não insiste no Serper por 1h; se estava fora do ar, 10 min. */
const COOLDOWN_MS = { credits: 60 * 60 * 1000, down: 10 * 60 * 1000 } as const;

/** Erro de crédito do Serper: 402/403 ou mensagem "not enough credits". */
export function isCreditError(e: unknown): boolean {
  if (e instanceof ProviderQuotaError) return e.status === 402 || e.status === 403;
  return (
    e instanceof Error && /not enough credits|insufficient credits|no credits/i.test(e.message)
  );
}

export interface SearchFallbackOptions {
  serper: DiscoveryProvider;
  deepseek: DiscoveryProvider;
  store: SearchStatusStore;
  /** Créditos restantes do Serper (o saldo já consultado pelo painel). null = desconhecido. */
  serperCredits?: () => Promise<number | null>;
  minCredits?: number;
  now?: () => number;
  onSwitch?: (status: SearchStatus) => void;
}

export function createSearchFallbackProvider(
  opts: SearchFallbackOptions,
): DiscoveryProvider & { lastUsed?: string } {
  const now = opts.now ?? Date.now;
  const min = opts.minCredits ?? DEFAULT_SERPER_MIN_CREDITS;
  const self: DiscoveryProvider & { lastUsed?: string } = {
    name: "serper",
    lastUsed: undefined,
    async search(q) {
      const prev = await opts.store.get().catch(() => null);
      const record = async (s: Omit<SearchStatus, "at">) => {
        if (prev?.active !== s.active || prev.cause !== s.cause)
          opts.onSwitch?.({ ...s, at: new Date(now()).toISOString() });
        if (prev?.active !== s.active || prev.cause !== s.cause || prev.reason !== s.reason)
          await opts.store.set({ ...s, at: new Date(now()).toISOString() }).catch(() => undefined);
      };
      const viaDeepseek = async (s: Omit<SearchStatus, "at" | "active">) => {
        await record({ ...s, active: "deepseek_search" });
        self.lastUsed = "deepseek_search";
        return opts.deepseek.search(q);
      };
      const credits = opts.serperCredits ? await opts.serperCredits().catch(() => null) : null;
      if (credits !== null && credits < min)
        return viaDeepseek({
          cause: "low_balance",
          reason: `Créditos do Serper abaixo do mínimo (${String(credits)} < ${String(min)})`,
        });
      if (
        prev?.active === "deepseek_search" &&
        (prev.cause === "credits" || prev.cause === "down")
      ) {
        const age = now() - Date.parse(prev.at);
        if (Number.isFinite(age) && age < COOLDOWN_MS[prev.cause]) {
          self.lastUsed = "deepseek_search";
          return opts.deepseek.search(q);
        }
      }
      try {
        const out = await opts.serper.search(q);
        await record({
          active: "serper",
          cause: "ok",
          reason: credits !== null ? `Serper com créditos (${String(credits)})` : "Serper ativo",
        });
        self.lastUsed = "serper";
        return out;
      } catch (e) {
        if (isCreditError(e))
          return viaDeepseek({
            cause: "credits",
            reason: `Serper sem créditos (${e instanceof ProviderQuotaError ? `HTTP ${String(e.status)}` : "not enough credits"})`,
          });
        const msg = e instanceof Error ? e.message : "erro";
        return viaDeepseek({ cause: "down", reason: `Serper fora do ar (${msg.slice(0, 80)})` });
      }
    },
  };
  return self;
}

/* ------------------------- DeepSeek Search API ------------------------- */

interface DeepseekSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
}

export interface DeepseekSearchOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Chamado a cada requisição HTTP real (para lançar custo "search"). */
  onRequest?: () => void;
  count?: number;
}

function queryText(q: DiscoveryQuery): string {
  const what = queryWhat(q);
  return `${what} em ${q.city}${q.uf ? ` ${q.uf}` : ""}`;
}

/** Normaliza resultados da DeepSeek no formato orgânico do Serper (title/link/snippet). */
export function toSerperOrganic(
  results: readonly DeepseekSearchResult[],
): { title: string; link: string; snippet: string }[] {
  return results
    .filter((r) => typeof r.url === "string" && r.url.startsWith("http"))
    .map((r) => ({
      title: r.title ?? "",
      link: r.url ?? "",
      snippet: [r.snippet, r.summary].filter(Boolean).join(" ").slice(0, 600),
    }));
}

const SKIP_HOSTS =
  /(^|\.)(google\.|youtube\.com|wikipedia\.org|tiktok\.com|twitter\.com|x\.com|linkedin\.com|reclameaqui\.com\.br|gov\.br)/i;

/** Sites (não-redes) com telefone no snippet/resumo viram candidatos (como o /places do Serper). */
export function webCandidates(
  q: DiscoveryQuery,
  organic: readonly { title: string; link: string; snippet: string }[],
): SupplierCandidate[] {
  const out: SupplierCandidate[] = [];
  for (const o of organic) {
    let host = "";
    try {
      host = new URL(o.link).hostname;
    } catch {
      continue;
    }
    if (isSocialProfileUrl(o.link.split("?")[0] ?? "") || SKIP_HOSTS.test(host)) continue;
    const phone = extractBrazilPhones(`${o.title} ${o.snippet}`)[0]?.phone.e164;
    if (phone === undefined) continue;
    const name =
      o.title
        .split(/[|•(]| - | – /)[0]
        ?.trim()
        .slice(0, 120) ?? "";
    if (name.length < 2) continue;
    out.push({
      name,
      category: q.category,
      phone,
      sourceUrl: o.link.slice(0, 500),
      websiteUrl: o.link.slice(0, 500),
      externalId: `dssearch:${o.link.slice(0, 100)}`,
      city: q.city,
      hint: o.snippet.slice(0, 120) || undefined,
    });
  }
  return out;
}

export function createDeepseekSearchProvider(opts: DeepseekSearchOptions): DiscoveryProvider {
  const f: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  const base = (opts.baseUrl ?? "https://api.deepseek.com")
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "");
  const call = async (
    query: string,
  ): Promise<{ title: string; link: string; snippet: string }[]> => {
    opts.onRequest?.();
    const res = await f(`${base}/v1/tools/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, count: Math.min(50, opts.count ?? 20), need_content: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429 || res.status === 402)
      throw new ProviderQuotaError("deepseek_search", res.status);
    if (!res.ok) throw new Error(`deepseek_search HTTP ${String(res.status)}`);
    return toSerperOrganic(
      ((await res.json()) as { results?: DeepseekSearchResult[] }).results ?? [],
    );
  };
  return {
    name: "deepseek_search",
    async search(q) {
      const local = await call(`${queryText(q)} telefone contato lang:pt`);
      let social: { title: string; link: string; snippet: string }[] = [];
      try {
        social = await call(`${queryText(q)} (site:instagram.com OR site:facebook.com)`);
      } catch (e) {
        if (e instanceof ProviderQuotaError) throw e;
      }
      const items = [...webCandidates(q, local), ...socialCandidates(q, [...social, ...local])];
      const seen = new Set<string>();
      const out: SupplierCandidate[] = [];
      for (const c of items) {
        const key = c.phone ?? dedupeKey(c.name, q.city);
        if (seen.has(key) || q.exclude.includes(key) || q.exclude.includes(c.name)) continue;
        seen.add(key);
        out.push(c);
        if (out.length >= q.limit) break;
      }
      return out;
    },
  };
}
