import { z } from "zod";

import type { SupplierCandidate } from "../pure";
import type { DiscoveryProvider, DiscoveryQuery, FetchLike } from "./types";

/** Tags OSM por categoria do catálogo (custo zero, ODbL — atribuição: © OpenStreetMap). */
export const OSM_TAGS: Record<string, string[]> = {
  espaco: ['amenity"="events_venue', 'amenity"="community_centre', 'leisure"="resort'],
  buffet: ['craft"="caterer', 'shop"="deli'],
  bebidas: ['shop"="beverages', 'shop"="alcohol'],
  bolo_doces: ['shop"="confectionery', 'shop"="pastry', 'shop"="bakery'],
  decoracao: ['shop"="party', 'shop"="florist'],
  foto_video: ['craft"="photographer', 'shop"="photo'],
  som_dj: ['shop"="party', 'shop"="hifi'],
  mobiliario: ['shop"="party'],
  lembrancinhas: ['shop"="gift'],
  convites: ['shop"="stationery', 'craft"="printer'],
  transporte: ['amenity"="bus_station', 'office"="travel_agent'],
  seguranca: ['office"="security'],
  limpeza: ['shop"="dry_cleaning', 'office"="company'],
};

const overpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export function buildOverpassQuery(city: string, category: string): string | null {
  const tags = OSM_TAGS[category];
  if (tags === undefined) return null;
  const safeCity = city.replace(/["\\]/g, "");
  const parts = tags.map((t) => `nwr["${t}"](area.a);`).join("");
  return `[out:json][timeout:25];area["name"="${safeCity}"]["boundary"="administrative"]->.a;(${parts});out tags 60;`;
}

export function createOverpassProvider(
  fetchImpl: FetchLike = fetch,
  endpoint = "https://overpass-api.de/api/interpreter",
): DiscoveryProvider {
  return {
    name: "overpass",
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const q = buildOverpassQuery(query.city, query.category);
      if (q === null) return [];
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "EventeIA/1.0 (descoberta de fornecedores)" },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${String(res.status)}`);
      const parsed = overpassSchema.safeParse(await res.json());
      if (!parsed.success) return [];
      const out: SupplierCandidate[] = [];
      for (const el of parsed.data.elements) {
        const tags = el.tags ?? {};
        const name = tags.name;
        const phone = tags["contact:whatsapp"] ?? tags["contact:mobile"] ?? tags.phone ?? tags["contact:phone"];
        if (name === undefined || phone === undefined) continue;
        const website = tags.website ?? tags["contact:website"];
        out.push({
          name,
          category: query.category,
          phone: phone.split(";")[0] ?? phone,
          sourceUrl: `https://www.openstreetmap.org/${el.type}/${String(el.id)}`,
          websiteUrl: website !== undefined && /^https?:\/\//.test(website) ? website : undefined,
          externalId: `${el.type}/${String(el.id)}`,
          city: query.city,
        });
        if (out.length >= query.limit + query.exclude.length) break;
      }
      return out;
    },
  };
}
