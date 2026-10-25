import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { applyDeepseekSelection, createDeepseekRefinedProvider } from "@/lib/discovery/providers/deepseek";
import { buildOverpassQuery, createOverpassProvider, mobilePhonesFromTags, OVERPASS_USER_AGENT } from "@/lib/discovery/providers/overpass";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import type { DiscoveryQuery } from "@/lib/discovery/providers/types";

const fixture = readFileSync(join(__dirname, "../fixtures/overpass-taubate-buffet.json"), "utf8");
const json = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
const query: DiscoveryQuery = { category: "buffet", categoryLabel: "Buffet", city: "Taubaté", uf: "SP", eventTypeLabel: "Aniversário", limit: 5, exclude: [] };

describe("Overpass (fixture)", () => {
  it("usa área por código IBGE quando o município é conhecido, User-Agent e só celulares", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(json(fixture)));
    const p = createOverpassProvider(fetchImpl, { minIntervalMs: 0 });
    const found = await p.search(query);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(OVERPASS_USER_AGENT);
    expect(decodeURIComponent((init?.body as string))).toContain("IBGE:GEOCODIGO");
    expect(found.map((c) => c.phone)).toEqual(["+5512991112233", "+5512988223344", "+5512997334455"]);
    // cache: segunda busca não refaz a requisição
    await p.search(query);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("repete em 429 com backoff e troca de endpoint", async () => {
    const fetchImpl = vi
      .fn((_url: string, _init?: RequestInit) => Promise.resolve(json(fixture)))
      .mockImplementationOnce(() => Promise.resolve(new Response("", { status: 429 })));
    const sleep = vi.fn(() => Promise.resolve());
    const p = createOverpassProvider(fetchImpl, { minIntervalMs: 10, sleep, endpoints: ["https://a/x", "https://b/x"] });
    const found = await p.search(query);
    expect(found.length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://b/x");
  });

  it("todas as categorias principais têm query", () => {
    for (const c of ["espaco", "buffet", "bebidas", "bolo_doces", "decoracao", "foto_video", "som_dj", "mobiliario", "recreacao", "convites"]) {
      expect(buildOverpassQuery("Taubaté", c, { uf: "SP" })).not.toBeNull();
    }
    expect(mobilePhonesFromTags({ phone: "12 3622-1234", "contact:mobile": "(12) 99111-2233" })).toEqual(["+5512991112233"]);
  });
});

describe("DeepSeek pós-processamento", () => {
  it("filtra irrelevantes, normaliza nome e nunca aceita contato inventado", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("deepseek")) {
        const body = JSON.parse((init?.body as string)) as { model: string; messages: { content: string }[] };
        expect(body.model).toBe("deepseek-flash");
        expect(body.messages[0]?.content).toContain("Escola Estadual Buffet");
        return Promise.resolve(
          json(JSON.stringify({ choices: [{ message: { content: '{"keep":[{"i":0,"name":"Buffet Encanto","relevant":true},{"i":1,"relevant":true},{"i":2,"relevant":false},{"i":99,"name":"Fake"}]}' } }] })),
        );
      }
      return Promise.resolve(json(fixture));
    });
    const providers = resolveProviders({ DISCOVERY_PROVIDERS: "overpass", DEEPSEEK_API_KEY: "k", DEEPSEEK_BASE_URL: "https://api.deepseek.com" }, fetchImpl);
    expect(providers.map((p) => p.name)).toEqual(["overpass"]);
    const found = await providers[0].search(query);
    expect(found.map((c) => [c.name, c.phone])).toEqual([
      ["Buffet Encanto", "+5512991112233"],
      ["Salgados da Tia", "+5512988223344"],
    ]);
    expect(found.every((c) => c.sourceUrl.startsWith("https://www.openstreetmap.org/"))).toBe(true);
    expect(calls.some((u) => u.includes("deepseek"))).toBe(true);
  });

  it("descarta fixo e baixa confiança", () => {
    const raw = [{ name: "A", category: "buffet", phone: "+551236221234", sourceUrl: "https://www.openstreetmap.org/node/1" }];
    expect(applyDeepseekSelection('{"keep":[{"i":0}]}', raw, 5)).toEqual([]);
    const mob = [{ ...raw[0], phone: "+5512991112233" }];
    expect(applyDeepseekSelection('{"keep":[{"i":0,"confidence":0.2}]}', mob, 5)).toEqual([]);
  });

  it("erro HTTP do DeepSeek propaga (sem disparo cego)", async () => {
    const source = { name: "overpass", search: () => Promise.resolve([{ name: "A", category: "buffet", phone: "+5512991112233", sourceUrl: "https://www.openstreetmap.org/node/1" }]) };
    const p = createDeepseekRefinedProvider({ apiKey: "k", source, fetchImpl: () => Promise.resolve(new Response("", { status: 500 })) });
    await expect(p.search(query)).rejects.toThrow("DeepSeek HTTP 500");
  });
});
