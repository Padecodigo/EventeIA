/* eslint-disable @typescript-eslint/require-await -- fakes de fetch/provedores assíncronos */
import { describe, expect, it, vi } from "vitest";

import { resolveProviders } from "@/lib/discovery/providers/registry";
import { createMemorySearchStatusStore } from "@/lib/discovery/providers/search-fallback";
import type { DiscoveryQuery } from "@/lib/discovery/providers/types";

const q: DiscoveryQuery = {
  category: "buffet",
  categoryLabel: "Buffet",
  city: "Campinas",
  uf: "SP",
  eventTypeLabel: "Casamento",
  limit: 10,
  exclude: [],
};

/** Serper sem créditos (402) → mesma consulta na DeepSeek Search; custo lançado como "search" do evento. */
describe("busca de fornecedores: Serper → DeepSeek Search ponta a ponta (registry)", () => {
  it("Serper 402 troca automaticamente, normaliza e mede o custo no provedor certo", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("serper.dev"))
        return new Response(JSON.stringify({ message: "Not enough credits" }), { status: 402 });
      if (url.includes("/tools/search"))
        return new Response(
          JSON.stringify({
            results: [
              {
                title: "Buffet Sabor - Campinas",
                url: "https://buffetsabor.com.br",
                snippet: "(19) 99777-1234",
              },
            ],
          }),
          { status: 200 },
        );
      // refino DeepSeek (chat) mantém tudo
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ keep: [{ i: 0, relevant: true, confidence: 0.9 }] }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const metered: string[] = [];
    const store = createMemorySearchStatusStore();
    const providers = resolveProviders(
      {
        DISCOVERY_PROVIDERS: "serper",
        SERPER_API_KEY: "s",
        DEEPSEEK_API_KEY: "d",
        SERPER_MIN_CREDITS: 100,
      },
      fetchImpl,
      undefined,
      (p) => metered.push(p),
      { store, serperCredits: async () => 2499 },
    );
    expect(providers.map((p) => p.name)).toEqual(["serper"]);
    const out = (await providers[0]?.search(q)) ?? [];
    expect(out[0]?.phone).toBe("+5519997771234");
    expect(urls.some((u) => u.endsWith("/v1/tools/search"))).toBe(true);
    expect(metered).toContain("serper");
    expect(metered.filter((m) => m === "search")).toHaveLength(2);
    const s = await store.get();
    expect(s?.active).toBe("deepseek_search");
    expect(s?.cause).toBe("credits");
  });

  it("sem chave DeepSeek, o Serper segue sozinho (sem fallback)", async () => {
    const fetchImpl = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify({
            places: [{ title: "Buffet Y", phoneNumber: "(19) 99666-1111", cid: "1" }],
            organic: [],
          }),
          { status: 200 },
        ),
    );
    const providers = resolveProviders(
      { DISCOVERY_PROVIDERS: "serper", SERPER_API_KEY: "s" },
      fetchImpl,
    );
    const out = (await providers[0]?.search(q)) ?? [];
    expect(out[0]?.name).toBe("Buffet Y");
    expect(fetchImpl.mock.calls.every((c) => !String(c[0]).includes("tools/search"))).toBe(true);
  });
});
