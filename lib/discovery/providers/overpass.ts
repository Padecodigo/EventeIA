import { z } from "zod";

import { resolveMunicipio } from "@/lib/geo/municipios";
import { parseBrazilPhone } from "@/lib/phone";

import type { SupplierCandidate } from "../pure";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery, type FetchLike } from "./types";

/**
 * OpenStreetMap via Overpass (custo zero, ODbL — atribuição: © OpenStreetMap contributors).
 * Política de uso: User-Agent identificável, 1 requisição por vez com intervalo mínimo,
 * timeout curto, cache em memória por (município, categoria) e backoff em 429/504.
 */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
export const OVERPASS_USER_AGENT = "EventeIA/1.0 (+https://eventeia.com.br; descoberta de fornecedores de festas)";
export const OVERPASS_MIN_INTERVAL_MS = 2_000;
export const OVERPASS_CACHE_TTL_MS = 24 * 3600_000;

/** Tags OSM por categoria (filtros `[k=v]`). */
export const OSM_TAGS: Record<string, string[]> = {
  espaco: ['["amenity"="events_venue"]', '["amenity"="community_centre"]["name"]', '["leisure"="party"]', '["club"="party"]'],
  buffet: ['["craft"="caterer"]', '["shop"="deli"]'],
  bebidas: ['["shop"="beverages"]', '["shop"="alcohol"]', '["craft"="brewery"]'],
  bolo_doces: ['["shop"="confectionery"]', '["shop"="pastry"]', '["shop"="bakery"]', '["craft"="confectionery"]'],
  decoracao: ['["shop"="party"]', '["shop"="florist"]', '["craft"="decorator"]'],
  foto_video: ['["craft"="photographer"]', '["shop"="photo"]', '["craft"="photographic_laboratory"]'],
  som_dj: ['["shop"="party"]', '["shop"="hifi"]', '["shop"="music"]', '["craft"="dj"]'],
  mobiliario: ['["shop"="party"]', '["shop"="rental"]', '["amenity"="rental"]'],
  recreacao: ['["shop"="party"]', '["shop"="toys"]', '["shop"="rental"]'],
  musica_ao_vivo: ['["shop"="music"]', '["amenity"="music_school"]'],
  iluminacao: ['["shop"="party"]', '["shop"="lighting"]', '["shop"="hifi"]'],
  garcons: ['["craft"="caterer"]', '["office"="employment_agency"]'],
  louca: ['["shop"="party"]', '["shop"="rental"]', '["shop"="houseware"]'],
  gerador: ['["shop"="rental"]', '["craft"="electrician"]'],
  cerimonial: ['["office"="event_management"]', '["craft"="event_planner"]'],
  audiovisual: ['["shop"="hifi"]', '["shop"="electronics"]', '["shop"="rental"]'],
  lembrancinhas: ['["shop"="gift"]', '["shop"="party"]', '["shop"="craft"]'],
  convites: ['["shop"="stationery"]', '["craft"="printer"]', '["shop"="copyshop"]'],
  transporte: ['["office"="travel_agent"]', '["amenity"="bus_station"]["name"]'],
  seguranca: ['["office"="security"]'],
  limpeza: ['["shop"="dry_cleaning"]', '["office"="cleaning"]'],
};

/** Palavras no nome (regex case-insensitive) — pega negócios com tags genéricas. */
export const OSM_NAME_HINTS: Record<string, string> = {
  espaco: "buffet|festa|eventos|sal[aã]o de festa|espa[cç]o",
  buffet: "buffet|catering|eventos|salgad|churrasc",
  bebidas: "bebida|drink|bartender|coquetel|chopp",
  bolo_doces: "bolo|doce|confeitar|brigadeir|cake",
  decoracao: "decora|bal[aã]o|festa",
  foto_video: "foto|fotograf|filmag|v[ií]deo|studio",
  som_dj: "\\bdj\\b|som |sonoriza|ilumina",
  mobiliario: "loca[cç][aã]o|aluguel|locadora|m[oó]veis|festa",
  recreacao: "brinquedo|pula.pula|infl[aá]ve|recrea",
  musica_ao_vivo: "banda|m[uú]sic|cantor",
  iluminacao: "ilumina|som e luz",
  garcons: "gar[cç]o|buffet|eventos",
  louca: "loca[cç][aã]o|aluguel|festa",
  gerador: "gerador",
  cerimonial: "cerimonial|assessoria|eventos",
  audiovisual: "tel[aã]o|projetor|audiovisual|som ",
  lembrancinhas: "lembranc|personaliz",
  convites: "convite|gr[aá]fica",
};

const overpassSchema = z.object({
  elements: z.array(z.object({ type: z.string(), id: z.number(), tags: z.record(z.string(), z.string()).optional() })),
});

function esc(s: string): string {
  return s.replace(/["\\]/g, "");
}

/** Área do município: código IBGE (tag IBGE:GEOCODIGO) > nome dentro da UF > nome. */
export function overpassAreaClause(q: { city: string; uf?: string; ibgeCode?: number }): string {
  if (q.ibgeCode !== undefined) {
    return `rel["boundary"="administrative"]["IBGE:GEOCODIGO"="${String(q.ibgeCode)}"];map_to_area->.a;`;
  }
  if (q.uf !== undefined && /^[A-Z]{2}$/.test(q.uf)) {
    return `area["ISO3166-2"="BR-${q.uf}"]->.s;area["name"="${esc(q.city)}"]["boundary"="administrative"](area.s)->.a;`;
  }
  return `area["name"="${esc(q.city)}"]["boundary"="administrative"]["admin_level"="8"]->.a;`;
}

export function buildOverpassQuery(city: string, category: string, opts: { uf?: string; ibgeCode?: number } = {}): string | null {
  const tags = OSM_TAGS[category];
  if (tags === undefined) return null;
  const parts = tags.map((t) => `nwr${t}(area.a);`);
  const hint = OSM_NAME_HINTS[category];
  if (hint !== undefined) parts.push(`nwr["name"~"${hint}",i]["shop"](area.a);`, `nwr["name"~"${hint}",i]["craft"](area.a);`, `nwr["name"~"${hint}",i]["amenity"](area.a);`, `nwr["name"~"${hint}",i]["office"](area.a);`);
  return `[out:json][timeout:25];${overpassAreaClause({ city, ...opts })}(${parts.join("")});out tags 150;`;
}

/** Todos os telefones das tags (WhatsApp/celular primeiro), normalizados; só celulares (WhatsApp). */
export function mobilePhonesFromTags(tags: Record<string, string>): string[] {
  const keys = ["contact:whatsapp", "whatsapp", "contact:mobile", "mobile", "phone", "contact:phone", "phone:mobile"];
  const out: string[] = [];
  for (const k of keys) {
    for (const raw of (tags[k] ?? "").split(/[;,/]/)) {
      const p = parseBrazilPhone(raw.trim());
      if (p !== null && p.mobile && !out.includes(p.e164)) out.push(p.e164);
    }
  }
  return out;
}

interface CacheEntry {
  at: number;
  items: SupplierCandidate[];
}

export function createOverpassProvider(
  fetchImpl: FetchLike = fetch,
  options: { endpoints?: string[]; minIntervalMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): DiscoveryProvider {
  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;
  const minInterval = options.minIntervalMs ?? OVERPASS_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  let chain: Promise<unknown> = Promise.resolve();
  let lastCall = 0;

  const fetchElements = async (q: string): Promise<z.infer<typeof overpassSchema>["elements"]> => {
    let lastErr: Error = new Error("Overpass indisponível");
    for (let attempt = 0; attempt < endpoints.length * 2; attempt += 1) {
      const wait = lastCall + minInterval * (attempt === 0 ? 1 : 2 ** attempt) - now();
      if (wait > 0) await sleep(wait);
      lastCall = now();
      const endpoint = endpoints[attempt % endpoints.length] ?? endpoints[0] ?? OVERPASS_ENDPOINTS[0];
      try {
        const res = await fetchImpl(endpoint ?? "", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OVERPASS_USER_AGENT, Accept: "application/json" },
          body: `data=${encodeURIComponent(q)}`,
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 429 || res.status === 504 || res.status >= 500) {
          lastErr = res.status === 429 ? new ProviderQuotaError("overpass", 429) : new Error(`Overpass HTTP ${String(res.status)}`);
          continue;
        }
        if (!res.ok) throw new Error(`Overpass HTTP ${String(res.status)}`);
        const parsed = overpassSchema.safeParse(await res.json());
        return parsed.success ? parsed.data.elements : [];
      } catch (error) {
        if (error instanceof Error && /HTTP 4\d\d/.test(error.message)) throw error;
        lastErr = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastErr;
  };

  return {
    name: "overpass",
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const muni = resolveMunicipio({ code: query.ibgeCode, name: query.city, uf: query.uf });
      const uf = query.uf ?? muni?.uf;
      const ibgeCode = query.ibgeCode ?? (muni !== null && (query.uf === undefined || muni.uf === query.uf) ? muni.code : undefined);
      const q = buildOverpassQuery(query.city, query.category, { uf, ibgeCode });
      if (q === null) return [];
      const key = `${String(ibgeCode ?? "")}|${query.city}|${uf ?? ""}|${query.category}`;
      const hit = cache.get(key);
      let items: SupplierCandidate[];
      if (hit !== undefined && now() - hit.at < OVERPASS_CACHE_TTL_MS) {
        items = hit.items;
      } else {
        // Serializa: no máximo 1 requisição simultânea ao Overpass por processo.
        const run = chain.then(() => fetchElements(q));
        chain = run.catch(() => undefined);
        let elements = await run;
        // Fallback: área por IBGE ausente no OSM → tenta por nome+UF.
        if (elements.length === 0 && ibgeCode !== undefined) {
          const q2 = buildOverpassQuery(query.city, query.category, { uf });
          if (q2 !== null) {
            const run2 = chain.then(() => fetchElements(q2));
            chain = run2.catch(() => undefined);
            elements = await run2;
          }
        }
        items = [];
        const seen = new Set<string>();
        for (const el of elements) {
          const tags = el.tags ?? {};
          const name = tags.name ?? tags.brand;
          if (name === undefined) continue;
          const phones = mobilePhonesFromTags(tags);
          const phone = phones[0];
          if (phone === undefined || seen.has(phone)) continue;
          seen.add(phone);
          const website = tags.website ?? tags["contact:website"] ?? tags["contact:instagram"];
          const kind = ["shop", "craft", "amenity", "office", "leisure"].map((k) => (tags[k] !== undefined ? `${k}=${tags[k]}` : "")).filter(Boolean).join(",");
          items.push({
            name,
            category: query.category,
            phone,
            sourceUrl: `https://www.openstreetmap.org/${el.type}/${String(el.id)}`,
            websiteUrl: website !== undefined && /^https?:\/\//.test(website) ? website : undefined,
            externalId: `${el.type}/${String(el.id)}`,
            city: query.city,
            ...(kind.length > 0 ? { hint: kind.slice(0, 80) } : {}),
          });
        }
        cache.set(key, { at: now(), items });
      }
      const exclude = new Set(query.exclude);
      return items.filter((c) => c.phone === undefined || !exclude.has(c.phone)).slice(0, Math.max(query.limit, 1) * 4);
    },
  };
}
