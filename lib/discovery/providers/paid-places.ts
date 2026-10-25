import { extractBrazilPhones } from "@/lib/phone";

import { dedupeKey, type SupplierCandidate } from "../pure";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery, type FetchLike } from "./types";

/**
 * Provedores PAGOS de locais (opcionais, atrás de env): Serper (/places) e Google Places
 * (Text Search New). OSM + DeepSeek continua o padrão; estes só entram com chave.
 * Eficiência: 1 requisição por (categoria, cidade), cache em memória 24h, dedupe e
 * exclusão de conhecidos — e cada requisição real é medida (onRequest) para o painel de custos.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PaidPlacesOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  /** Chamado a cada requisição HTTP real (não em cache) — usado para lançar custo. */
  onRequest?: (provider: "serper" | "google_places") => void;
  now?: () => number;
}

function queryText(q: DiscoveryQuery): string {
  const what = q.category === "outros" && q.freeText ? q.freeText : q.categoryLabel;
  return `${what} em ${q.city}${q.uf ? ` ${q.uf}` : ""}`;
}

function finalize(q: DiscoveryQuery, items: SupplierCandidate[]): SupplierCandidate[] {
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
}

function cached(
  name: "serper" | "google_places",
  opts: PaidPlacesOptions,
  fetchRaw: (q: DiscoveryQuery, f: FetchLike) => Promise<SupplierCandidate[]>,
): DiscoveryProvider {
  const cache = new Map<string, { at: number; items: SupplierCandidate[] }>();
  const now = opts.now ?? Date.now;
  const f: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  return {
    name,
    async search(q) {
      const key = `${q.category}|${dedupeKey(queryText(q), "")}`;
      const hit = cache.get(key);
      if (hit !== undefined && now() - hit.at < CACHE_TTL_MS) return finalize(q, hit.items);
      opts.onRequest?.(name);
      const items = await fetchRaw(q, f);
      cache.set(key, { at: now(), items });
      return finalize(q, items);
    },
  };
}

function checkStatus(provider: string, res: Response): void {
  if (res.status === 429 || res.status === 402 || res.status === 403) throw new ProviderQuotaError(provider, res.status);
  if (!res.ok) throw new Error(`${provider} HTTP ${String(res.status)}`);
}

interface SerperPlace {
  title?: string;
  phoneNumber?: string;
  website?: string;
  cid?: string;
  address?: string;
}

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
}

/** Perfil público de Instagram/Facebook (ignora posts/reels/grupos genéricos). */
export function isSocialProfileUrl(url: string): boolean {
  return /^https:\/\/(www\.)?(instagram\.com\/(?!p\/|reel\/|explore\/)[A-Za-z0-9_.]+\/?$|facebook\.com\/(?!groups\/|events\/|watch)[A-Za-z0-9.\-]+\/?$)/.test(url);
}

/** Converte resultados orgânicos do Google (Instagram/Facebook) em candidatos; telefone extraído do snippet. */
export function socialCandidates(q: DiscoveryQuery, organic: readonly SerperOrganic[]): SupplierCandidate[] {
  const out: SupplierCandidate[] = [];
  for (const o of organic) {
    const link = (o.link ?? "").split("?")[0] ?? "";
    if (!isSocialProfileUrl(link)) continue;
    const name = (o.title ?? "").split(/[|•(@]| - | – /)[0]?.trim().slice(0, 120) ?? "";
    if (name.length < 2) continue;
    const phone = extractBrazilPhones(`${o.title ?? ""} ${o.snippet ?? ""}`)[0]?.phone.e164;
    out.push({ name, category: q.category, phone, sourceUrl: link.slice(0, 500), externalId: `serper:${link.slice(0, 100)}`, city: q.city, hint: (o.snippet ?? "").slice(0, 120) || undefined });
  }
  return out;
}

/**
 * Serper: 2 créditos por (categoria, cidade) — Google Maps (/places, traz telefone) +
 * Google web restrito a Instagram/Facebook (/search). Resultados em cache 24h.
 */
export function createSerperProvider(opts: PaidPlacesOptions): DiscoveryProvider {
  return cached("serper", opts, async (q, f) => {
    const headers = { "X-API-KEY": opts.apiKey, "Content-Type": "application/json" };
    const placesRes = await f("https://google.serper.dev/places", {
      method: "POST",
      headers,
      body: JSON.stringify({ q: queryText(q), gl: "br", hl: "pt-br" }),
      signal: AbortSignal.timeout(15_000),
    });
    checkStatus("serper", placesRes);
    const places = ((await placesRes.json()) as { places?: SerperPlace[] }).places ?? [];
    let social: SupplierCandidate[] = [];
    try {
      opts.onRequest?.("serper");
      const webRes = await f("https://google.serper.dev/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ q: `${queryText(q)} (site:instagram.com OR site:facebook.com)`, gl: "br", hl: "pt-br", num: 10 }),
        signal: AbortSignal.timeout(15_000),
      });
      checkStatus("serper", webRes);
      social = socialCandidates(q, ((await webRes.json()) as { organic?: SerperOrganic[] }).organic ?? []);
    } catch (e) {
      if (e instanceof ProviderQuotaError) throw e;
    }
    const fromPlaces = places
      .filter((p) => (p.title ?? "").trim().length >= 2)
      .map((p) => ({
        name: (p.title ?? "").trim().slice(0, 120),
        category: q.category,
        phone: p.phoneNumber?.trim().slice(0, 40) || undefined,
        sourceUrl: p.cid ? `https://maps.google.com/?cid=${p.cid}` : `https://www.google.com/maps/search/${encodeURIComponent(p.title ?? "")}`,
        websiteUrl: p.website?.startsWith("http") ? p.website.slice(0, 500) : undefined,
        externalId: p.cid ? `serper:${p.cid}` : undefined,
        city: q.city,
        hint: p.address?.slice(0, 120),
      }));
    return [...fromPlaces, ...social];
  });
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  formattedAddress?: string;
}

export function createGooglePlacesProvider(opts: PaidPlacesOptions): DiscoveryProvider {
  return cached("google_places", opts, async (q, f) => {
    const res = await f("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": opts.apiKey,
        "Content-Type": "application/json",
        // Field mask mínimo = SKU mais barato que ainda traz telefone/site.
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.formattedAddress,places.rating",
      },
      body: JSON.stringify({ textQuery: queryText(q), languageCode: "pt-BR", regionCode: "BR", pageSize: Math.min(20, Math.max(5, q.limit)) }),
      signal: AbortSignal.timeout(15_000),
    });
    checkStatus("google_places", res);
    const body = (await res.json()) as { places?: GooglePlace[] };
    return (body.places ?? [])
      .filter((p) => (p.displayName?.text ?? "").trim().length >= 2)
      .map((p) => ({
        name: (p.displayName?.text ?? "").trim().slice(0, 120),
        category: q.category,
        phone: (p.internationalPhoneNumber ?? p.nationalPhoneNumber)?.trim().slice(0, 40) || undefined,
        sourceUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id ?? ""}`,
        websiteUrl: p.websiteUri?.startsWith("http") ? p.websiteUri.slice(0, 500) : undefined,
        externalId: p.id ? `gplaces:${p.id}` : undefined,
        city: q.city,
        hint: p.formattedAddress?.slice(0, 120),
      }));
  });
}
