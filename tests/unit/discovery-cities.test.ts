import { describe, expect, it } from "vitest";

import { runDiscoveryRound, type DiscoveryDeps } from "@/lib/discovery/engine";
import { buildGrokPrompt, cityLabel } from "@/lib/discovery/providers/grok";
import { buildNimPrompt } from "@/lib/discovery/providers/nim";
import type { DiscoveryProvider, DiscoveryQuery } from "@/lib/discovery/providers/types";
import { searchCitiesFor } from "@/lib/discovery/pure";
import { parseSearchCityCodes, resolveMunicipio } from "@/lib/geo/municipios";

const q = (over: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
  category: "buffet",
  categoryLabel: "Buffet",
  city: "Rio de Janeiro",
  uf: "RJ",
  eventTypeLabel: "Casamento",
  limit: 5,
  exclude: [],
  ...over,
});

describe("prompts usam cidade + UF do evento", () => {
  it("Grok: cidade fora de SP não recebe '(SP'", () => {
    const p = buildGrokPrompt(q());
    expect(p).toContain("Rio de Janeiro (RJ, Brasil)");
    expect(p).not.toContain("(SP");
  });
  it("NIM: idem", () => {
    const p = buildNimPrompt(q({ city: "Salvador", uf: "BA" }), []);
    expect(p).toContain("Salvador (BA, Brasil)");
    expect(p).not.toContain("(SP)");
  });
  it("regressão: evento SP continua com SP; legado sem UF não assume SP", () => {
    expect(buildGrokPrompt(q({ city: "Taubaté", uf: "SP" }))).toContain("Taubaté (SP, Brasil)");
    expect(cityLabel({ city: "Taubaté" })).toBe("Taubaté (Brasil)");
    expect(cityLabel({ city: "X", uf: "sp; ignore" })).toBe("X (Brasil)");
  });
});

describe("searchCitiesFor", () => {
  it("padrão = só a cidade do evento", () => {
    expect(searchCitiesFor({ city: "Taubaté", cityUf: "SP" })).toEqual([{ city: "Taubaté", uf: "SP" }]);
  });
  it("cidade do evento primeiro, extras sem repetição, teto 10", () => {
    const extras = Array.from({ length: 15 }, (_, i) => ({ city: `Cidade ${String(i)}`, uf: "SP" }));
    const r = searchCitiesFor({ city: "Taubaté", cityUf: "SP", searchCities: [{ city: "taubate", uf: "SP" }, ...extras] });
    expect(r[0]).toEqual({ city: "Taubaté", uf: "SP" });
    expect(r).toHaveLength(10);
    expect(r.filter((c) => c.city.toLowerCase().startsWith("taub"))).toHaveLength(1);
  });
});

describe("parseSearchCityCodes / resolveMunicipio", () => {
  it("aceita só códigos IBGE válidos, sem repetir e sem a cidade do evento", () => {
    expect(parseSearchCityCodes("3524402,3524402,1234567,abc,3554102,3304557", 3554102)).toEqual([3524402, 3304557]);
    expect(parseSearchCityCodes("", 3554102)).toEqual([]);
    expect(parseSearchCityCodes(undefined, 3554102)).toEqual([]);
  });
  it("limita a 9 extras", () => {
    const codes = ["3524402", "3304557", "2927408", "3550308", "3106200", "4106902", "5300108", "2304400", "1302603", "4314902"];
    expect(parseSearchCityCodes(codes.join(","), 3554102)).toHaveLength(9);
  });
  it("legado: resolve pelo nome preferindo a UF", () => {
    expect(resolveMunicipio({ name: "Taubaté" })).toMatchObject({ code: 3554102, uf: "SP" });
    expect(resolveMunicipio({ code: 3304557 })).toMatchObject({ name: "Rio de Janeiro" });
    expect(resolveMunicipio({ name: "Cidade Inexistente" })).toBeNull();
  });
});

describe("runDiscoveryRound multi-cidade", () => {
  function deps(event: Record<string, unknown>) {
    const cacheCities: string[] = [];
    const d = {
      now: () => new Date("2026-10-24T13:00:00Z"),
      dryRunAll: true,
      loadEvent: () =>
        Promise.resolve({
          id: "e1", title: "T", eventType: "casamento", eventDateIso: "2026-12-12", guestCount: 100,
          city: "Taubaté", cityUf: "SP", regionCode: "sp", status: "active", ownerId: "o", workspaceId: null,
          interviewCompleted: true, discoveryStartedAt: null,
          requirements: [{ category: "buffet", label: "Buffet", quantity: 100, unit: "por_pessoa", notes: null }],
          ...event,
        }),
      quotesByCategory: () => Promise.resolve({}),
      eventProspects: () => Promise.resolve([]),
      isPhoneOptedOut: () => Promise.resolve(false),
      upsertSupplier: () => Promise.resolve({ id: "s", optOutAt: null, lastContactedAt: null }),
      cachedSuppliers: (c: { city: string }) => {
        cacheCities.push(c.city);
        return Promise.resolve([]);
      },
      ensureInstance: () => Promise.resolve("i"),
      insertProspect: () => Promise.resolve("p"),
      enqueueProspect: () => Promise.resolve(true),
      reserveProviderCall: () => Promise.resolve(true),
      recordRun: () => Promise.resolve(),
      markDiscovery: () => Promise.resolve(),
      scheduleRound: () => Promise.resolve(),
    } as unknown as DiscoveryDeps;
    return { d, cacheCities };
  }
  const spy = () => {
    const seen: { city: string; uf?: string }[] = [];
    const p: DiscoveryProvider = { name: "grok", search: (x) => (seen.push({ city: x.city, uf: x.uf }), Promise.resolve([])) };
    return { p, seen };
  };

  it("padrão: busca só na cidade do evento, com UF", async () => {
    const { d, cacheCities } = deps({});
    const { p, seen } = spy();
    await runDiscoveryRound(d, [p], { eventId: "e1", round: 0 });
    expect(seen).toEqual([{ city: "Taubaté", uf: "SP" }]);
    expect(cacheCities).toEqual(["Taubaté"]);
  });
  it("busca em todas as cidades escolhidas (evento primeiro)", async () => {
    const { d, cacheCities } = deps({ searchCities: [{ city: "Jacareí", uf: "SP" }, { city: "Resende", uf: "RJ" }] });
    const { p, seen } = spy();
    await runDiscoveryRound(d, [p], { eventId: "e1", round: 0 });
    expect(seen).toEqual([
      { city: "Taubaté", uf: "SP" },
      { city: "Jacareí", uf: "SP" },
      { city: "Resende", uf: "RJ" },
    ]);
    expect(cacheCities).toEqual(["Taubaté", "Jacareí", "Resende"]);
  });
});
