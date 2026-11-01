import type { SupplierCandidate } from "../pure";
import type { DiscoveryProvider, DiscoveryQuery } from "./types";

/**
 * Provedor fictício e determinístico (dev/testes). Números na faixa 12 9 0000-xxxx;
 * prospects de mock são SEMPRE dry-run — o worker nunca envia para eles.
 */
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function createMockProvider(): DiscoveryProvider {
  return {
    name: "mock",
    search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const out: SupplierCandidate[] = [];
      const base = hash(`${query.city}|${query.category}`) % 9000;
      for (
        let i = 0;
        out.length < query.limit && i < query.limit + query.exclude.length + 5;
        i += 1
      ) {
        const suffix = String((base + i * 37) % 10000).padStart(4, "0");
        const phone = `+55129${"0000"}${suffix}`;
        const name = `${query.categoryLabel} Exemplo ${String(i + 1)} (${query.city})`;
        if (query.exclude.includes(phone)) continue;
        out.push({
          name,
          category: query.category,
          phone,
          sourceUrl: `https://example.com/mock/${encodeURIComponent(query.category)}/${String(i + 1)}`,
          externalId: `mock-${query.city}-${query.category}-${String(i + 1)}`,
          city: query.city,
        });
      }
      return Promise.resolve(out);
    },
  };
}
