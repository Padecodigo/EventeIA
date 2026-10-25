/* eslint-disable @typescript-eslint/require-await -- fakes de fetch/provedores assíncronos */
import { describe, expect, it, vi } from "vitest";

import {
  createDeepseekSearchProvider,
  createMemorySearchStatusStore,
  createSearchFallbackProvider,
  isCreditError,
  toSerperOrganic,
  webCandidates,
} from "@/lib/discovery/providers/search-fallback";
import {
  ProviderQuotaError,
  type DiscoveryProvider,
  type DiscoveryQuery,
} from "@/lib/discovery/providers/types";
import { hasAutomaticFallback } from "@/lib/finance/balances";

const q: DiscoveryQuery = {
  category: "buffet",
  categoryLabel: "Buffet",
  city: "Campinas",
  uf: "SP",
  eventTypeLabel: "Casamento",
  limit: 10,
  exclude: [],
};
const cand = (name: string) => [
  { name, category: "buffet", city: "Campinas", sourceUrl: "https://x" },
];
const prov = (
  name: string,
  impl: () => Promise<ReturnType<typeof cand>>,
): DiscoveryProvider & { search: ReturnType<typeof vi.fn> } => ({ name, search: vi.fn(impl) });

describe("Serper → DeepSeek Search (troca automática)", () => {
  it("usa o Serper enquanto há créditos acima do mínimo", async () => {
    const serper = prov("serper", async () => cand("S"));
    const deepseek = prov("deepseek_search", async () => cand("D"));
    const store = createMemorySearchStatusStore();
    const p = createSearchFallbackProvider({
      serper,
      deepseek,
      store,
      serperCredits: async () => 2499,
      minCredits: 100,
    });
    expect((await p.search(q))[0]?.name).toBe("S");
    expect(deepseek.search).not.toHaveBeenCalled();
    expect((await store.get())?.active).toBe("serper");
  });

  it("saldo abaixo do mínimo: vai direto para a DeepSeek sem chamar o Serper", async () => {
    const serper = prov("serper", async () => cand("S"));
    const deepseek = prov("deepseek_search", async () => cand("D"));
    const store = createMemorySearchStatusStore();
    const p = createSearchFallbackProvider({
      serper,
      deepseek,
      store,
      serperCredits: async () => 50,
      minCredits: 100,
    });
    expect((await p.search(q))[0]?.name).toBe("D");
    expect(serper.search).not.toHaveBeenCalled();
    const s = await store.get();
    expect(s?.active).toBe("deepseek_search");
    expect(s?.cause).toBe("low_balance");
    expect(s?.reason).toMatch(/50 < 100/);
  });

  it.each([402, 403])(
    "regressão: erro de crédito %i troca na hora e REFAZ a mesma consulta na DeepSeek",
    async (status) => {
      const serper = prov("serper", async () =>
        Promise.reject(new ProviderQuotaError("serper", status)),
      );
      const deepseek = prov("deepseek_search", async () => cand("D"));
      const store = createMemorySearchStatusStore();
      const onSwitch = vi.fn();
      const p = createSearchFallbackProvider({
        serper,
        deepseek,
        store,
        serperCredits: async () => 2499,
        onSwitch,
      });
      expect((await p.search(q))[0]?.name).toBe("D");
      expect(deepseek.search).toHaveBeenCalledWith(q);
      expect((await store.get())?.cause).toBe("credits");
      expect(onSwitch).toHaveBeenCalledTimes(1);
      expect(p.lastUsed).toBe("deepseek_search");
      // Cooldown: a próxima busca não insiste no Serper sem créditos.
      await p.search(q);
      expect(serper.search).toHaveBeenCalledTimes(1);
    },
  );

  it("mensagem 'not enough credits' também é erro de crédito; Serper fora do ar cai na DeepSeek", async () => {
    expect(isCreditError(new Error("Not enough credits"))).toBe(true);
    expect(isCreditError(new ProviderQuotaError("serper", 429))).toBe(false);
    const serper = prov("serper", async () => Promise.reject(new Error("fetch failed")));
    const deepseek = prov("deepseek_search", async () => cand("D"));
    const store = createMemorySearchStatusStore();
    const p = createSearchFallbackProvider({ serper, deepseek, store });
    expect((await p.search(q))[0]?.name).toBe("D");
    expect((await store.get())?.cause).toBe("down");
  });

  it("volta ao Serper depois do cooldown quando ele responde", async () => {
    let t = 0;
    let fail = true;
    const serper = prov("serper", async () =>
      fail ? Promise.reject(new Error("HTTP 503")) : cand("S"),
    );
    const deepseek = prov("deepseek_search", async () => cand("D"));
    const store = createMemorySearchStatusStore();
    const p = createSearchFallbackProvider({ serper, deepseek, store, now: () => t });
    await p.search(q);
    fail = false;
    t = 11 * 60 * 1000;
    expect((await p.search(q))[0]?.name).toBe("S");
    expect((await store.get())?.active).toBe("serper");
  });

  it("saldo baixo do Serper não é emergência quando há fallback DeepSeek", () => {
    expect(hasAutomaticFallback("serper", true)).toBe(true);
    expect(hasAutomaticFallback("serper", false)).toBe(false);
    expect(hasAutomaticFallback("deepseek", true)).toBe(false);
  });
});

describe("DeepSeek Search API: chamada e normalização", () => {
  it("normaliza results[] (title/url/snippet/summary) no formato orgânico do Serper", () => {
    expect(
      toSerperOrganic([
        { title: "A", url: "https://a.com", snippet: "s", summary: "r" },
        { title: "sem url" },
      ]),
    ).toEqual([{ title: "A", link: "https://a.com", snippet: "s r" }]);
  });

  it("sites com telefone viram candidatos; ignora sites genéricos", () => {
    const out = webCandidates(q, [
      {
        title: "Buffet Alegria | Campinas",
        link: "https://buffetalegria.com.br/",
        snippet: "Ligue (19) 99876-5432",
      },
      { title: "Wikipedia", link: "https://pt.wikipedia.org/x", snippet: "(19) 99876-5433" },
      { title: "Sem fone", link: "https://semfone.com.br", snippet: "contato" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("Buffet Alegria");
    expect(out[0]?.phone).toBe("+5519998765432");
  });

  it("POST /v1/tools/search com Bearer, count<=50, mede cada requisição e traz perfis sociais", async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: JSON.parse(init?.body as string) as Record<string, unknown>,
        auth: (init?.headers as Record<string, string>).Authorization ?? "",
      });
      const social = String(calls.at(-1)?.body.query).includes("site:instagram.com");
      return new Response(
        JSON.stringify({
          results: social
            ? [
                {
                  title: "Doce Festa (@docefesta)",
                  url: "https://www.instagram.com/docefesta/",
                  snippet: "WhatsApp 19 98888-7777",
                },
              ]
            : [
                {
                  title: "Buffet X - Campinas",
                  url: "https://buffetx.com.br",
                  snippet: "Tel (19) 3232-1010",
                },
              ],
        }),
        { status: 200 },
      );
    });
    const onRequest = vi.fn();
    const p = createDeepseekSearchProvider({
      apiKey: "k",
      baseUrl: "https://api.deepseek.com/v1",
      fetchImpl,
      onRequest,
      count: 99,
    });
    const out = await p.search(q);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/v1/tools/search");
    expect(calls[0]?.auth).toBe("Bearer k");
    expect(calls[0]?.body.count).toBe(50);
    expect(calls[0]?.body.need_content).toBe(false);
    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(out.map((c) => c.name).sort()).toEqual(["Buffet X", "Doce Festa"]);
  });
});
