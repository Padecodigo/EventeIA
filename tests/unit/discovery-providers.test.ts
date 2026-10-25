import { describe, expect, it, vi } from "vitest";

import { createGrokProvider, parseGrokResponse, XAI_BASE_URL } from "@/lib/discovery/providers/grok";
import { createMockProvider } from "@/lib/discovery/providers/mock";
import { buildOverpassQuery, createOverpassProvider } from "@/lib/discovery/providers/overpass";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import type { DiscoveryQuery } from "@/lib/discovery/providers/types";

const query: DiscoveryQuery = {
  category: "buffet",
  categoryLabel: "Buffet",
  city: "Taubaté",
  eventTypeLabel: "Casamento",
  limit: 5,
  exclude: [],
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("GrokProvider (fetch mockado)", () => {
  it("chama /v1/responses com web_search + x_search e valida o JSON", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: '```json\n{"suppliers":[{"name":"Buffet Sabor","phone":"(12) 99123-4567","source_url":"https://exemplo.com.br/contato"}]}\n```',
                },
              ],
            },
          ],
        }),
      ),
    );
    const provider = createGrokProvider({ apiKey: "test-key", fetchImpl });
    const found = await provider.search(query);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ category: "buffet", city: "Taubaté", sourceUrl: "https://exemplo.com.br/contato" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${XAI_BASE_URL}/responses`);
    const body = JSON.parse(String(init.body)) as { model: string; tools: { type: string }[] };
    expect(body.model).toBe("grok-4.7");
    expect(body.tools.map((t) => t.type)).toEqual(["web_search", "x_search"]);
  });
  it("descarta itens sem source_url e respostas inválidas", () => {
    expect(parseGrokResponse({ output_text: '{"suppliers":[{"name":"Sem Fonte","phone":"12991234567"}]}' }, query)).toEqual([]);
    expect(parseGrokResponse({ nada: true }, query)).toEqual([]);
  });
  it("propaga erro HTTP", async () => {
    const provider = createGrokProvider({ apiKey: "k", fetchImpl: () => Promise.resolve(new Response("x", { status: 429 })) });
    await expect(provider.search(query)).rejects.toThrow("429");
  });
});

describe("OverpassProvider (fetch mockado)", () => {
  it("monta a query e lê nome/telefone das tags", async () => {
    expect(buildOverpassQuery("Taubaté", "buffet")).toContain('area["name"="Taubaté"]');
    expect(buildOverpassQuery("Taubaté", "categoria-inexistente")).toBeNull();
    const provider = createOverpassProvider(() =>
      Promise.resolve(
        jsonResponse({
          elements: [
            { type: "node", id: 1, tags: { name: "Salão Lua", phone: "+55 12 3622-1234" } },
            { type: "node", id: 2, tags: { name: "Sem telefone" } },
          ],
        }),
      ),
    );
    const found = await provider.search(query);
    expect(found).toHaveLength(1);
    expect(found[0]?.sourceUrl).toBe("https://www.openstreetmap.org/node/1");
  });
});

describe("registry DISCOVERY_PROVIDERS", () => {
  it("grok é o padrão com chave; sem chave cai para mock", () => {
    expect(resolveProviders({ XAI_API_KEY: "k" }).map((p) => p.name)).toEqual(["grok", "social", "overpass", "mock"]);
    expect(resolveProviders({}).map((p) => p.name)).toEqual(["mock"]);
    expect(resolveProviders({ DISCOVERY_PROVIDERS: "overpass,grok" }).map((p) => p.name)).toEqual(["overpass"]);
  });
  it("mock gera números fictícios determinísticos", async () => {
    const a = await createMockProvider().search(query);
    const b = await createMockProvider().search(query);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
