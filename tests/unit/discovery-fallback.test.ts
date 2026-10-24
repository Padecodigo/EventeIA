import { describe, expect, it, vi } from "vitest";

import { createFallbackProvider, createMemoryUsageStore, shouldUseFallback } from "@/lib/discovery/providers/fallback";
import { applyNimSelection, createNimProvider, NIM_BASE_URL } from "@/lib/discovery/providers/nim";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery } from "@/lib/discovery/providers/types";
import type { SupplierCandidate } from "@/lib/discovery/pure";

const query: DiscoveryQuery = { category: "buffet", categoryLabel: "Buffet", city: "Jacareí", eventTypeLabel: "Casamento", limit: 3, exclude: [] };
const cand = (name: string, phone: string): SupplierCandidate => ({ name, category: "buffet", phone, sourceUrl: "https://www.openstreetmap.org/node/1" });
const fake = (name: string, impl: () => Promise<SupplierCandidate[]>): DiscoveryProvider & { calls: number } => {
  const p = { name, calls: 0, search: () => { p.calls += 1; return impl(); } };
  return p;
};

describe("switch Grok → NIM", () => {
  it("troca ao atingir XAI_USAGE_SWITCH_PCT (25%) do orçamento diário", () => {
    expect(shouldUseFallback({ callsToday: 49, dailyBudget: 200, switchPct: 25, exhausted: false })).toBe(false);
    expect(shouldUseFallback({ callsToday: 50, dailyBudget: 200, switchPct: 25, exhausted: false })).toBe(true);
    expect(shouldUseFallback({ callsToday: 0, dailyBudget: 200, switchPct: 25, exhausted: true })).toBe(true);
  });

  it("usa Grok até o limiar e depois o NIM", async () => {
    const grok = fake("grok", () => Promise.resolve([cand("A", "+5512991110001")]));
    const nim = fake("nim", () => Promise.resolve([cand("B", "+5512991110002")]));
    const router = createFallbackProvider({ primary: grok, fallback: nim, usage: createMemoryUsageStore(), dailyBudget: 8, switchPct: 25 });
    await router.search(query);
    expect(router.lastUsed).toBe("grok");
    await router.search(query);
    expect(router.lastUsed).toBe("grok");
    await router.search(query); // 2/8 = 25% ⇒ NIM
    expect(router.lastUsed).toBe("nim");
    expect([grok.calls, nim.calls]).toEqual([2, 1]);
  });

  it("erro de cota/429 do Grok cai no NIM na hora e fica marcado", async () => {
    const grok = fake("grok", () => Promise.reject(new ProviderQuotaError("grok", 429)));
    const nim = fake("nim", () => Promise.resolve([cand("B", "+5512991110002")]));
    const router = createFallbackProvider({ primary: grok, fallback: nim, usage: createMemoryUsageStore(), dailyBudget: 1000, switchPct: 25 });
    expect(await router.search(query)).toHaveLength(1);
    expect(router.lastUsed).toBe("nim");
    await router.search(query);
    expect(grok.calls).toBe(1);
  });

  it("erro comum do Grok não troca (propaga)", async () => {
    const grok = fake("grok", () => Promise.reject(new Error("xAI HTTP 500")));
    const nim = fake("nim", () => Promise.resolve([]));
    const router = createFallbackProvider({ primary: grok, fallback: nim, usage: createMemoryUsageStore(), dailyBudget: 1000, switchPct: 25 });
    await expect(router.search(query)).rejects.toThrow("500");
    expect(nim.calls).toBe(0);
  });

  it("registry: com as duas chaves o grok vira roteador; só NIM ⇒ nim", () => {
    const both = resolveProviders({ XAI_API_KEY: "x", NVIDIA_NIM_API_KEY: "n" });
    expect(both.map((p) => p.name)).toEqual(["grok", "overpass", "mock"]);
    expect(both[0]?.lastUsed).toBe("grok");
    expect(resolveProviders({ NVIDIA_NIM_API_KEY: "n" }).map((p) => p.name)).toEqual(["nim", "overpass", "mock"]);
  });
});

describe("NimProvider (sem busca ao vivo)", () => {
  const raw = [cand("Buffet Real", "+5512991110001"), cand("Padaria", "+5512991110003")];

  it("só devolve candidatos das fontes, por índice (nunca inventa contato)", () => {
    const out = applyNimSelection('{"keep":[{"i":0,"name":"Buffet Real Eventos"},{"i":7},{"i":0}]}', raw, 5);
    expect(out).toEqual([{ ...raw[0], name: "Buffet Real Eventos" }]);
    expect(applyNimSelection("não é json", raw, 5)).toEqual([]);
  });

  it("chama /chat/completions com os candidatos da fonte (fetch mockado)", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"keep":[{"i":1}]}' } }] }), { status: 200 })),
    );
    const source = fake("overpass", () => Promise.resolve(raw));
    const nim = createNimProvider({ apiKey: "k", sources: [source], fetchImpl });
    const out = await nim.search(query);
    expect(out.map((c) => c.phone)).toEqual(["+5512991110003"]);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${NIM_BASE_URL}/chat/completions`);
  });

  it("sem candidatos das fontes não chama o modelo", async () => {
    const fetchImpl = vi.fn();
    const nim = createNimProvider({ apiKey: "k", sources: [fake("overpass", () => Promise.resolve([]))], fetchImpl });
    expect(await nim.search(query)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
