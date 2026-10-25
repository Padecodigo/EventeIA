import { describe, expect, it, vi } from "vitest";

import { createGooglePlacesProvider, createSerperProvider, isSocialProfileUrl, socialCandidates } from "@/lib/discovery/providers/paid-places";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { budgetRemaining, dailyBurn, evaluateBalance, parseAsaasBalance, parseDeepseekBalance, parseSerperBalance } from "@/lib/finance/balances";
import { brlCentsToMicroUsd, parseBrlToCents } from "@/lib/finance/brl";
import { buildCostsPanel, lastMonths } from "@/lib/finance/costs-panel";
import { microUsdToBrlCents, requestsCost } from "@/lib/finance/pricing";
import type { CostRow, RevenueRow } from "@/lib/finance/report";

const cost = (p: Partial<CostRow>): CostRow => ({ at: "2026-10-25T12:00:00Z", provider: "deepseek", reason: "x", kind: "variable", eventId: null, costMicroUsd: 0, costBrlCents: 100, inputTokens: 0, outputTokens: 0, detail: "", ...p });
const rev = (p: Partial<RevenueRow>): RevenueRow => ({ at: "2026-10-25T12:00:00Z", paymentId: "p", clientId: "c", clientLabel: "c", plan: "x", eventId: null, grossCents: 1000, feeCents: 50, netCents: 950, status: "paid", refunded: false, ...p });

describe("painel de custos", () => {
  const now = new Date("2026-10-25T15:00:00Z");
  it("gasto hoje/mês por provedor, taxa Asaas, margem e custo por evento", () => {
    const p = buildCostsPanel(
      [
        cost({ provider: "deepseek", costBrlCents: 300, eventId: "e1" }),
        cost({ provider: "serper", costBrlCents: 200, eventId: "e2", at: "2026-10-10T12:00:00Z" }),
        cost({ provider: "vps", kind: "fixed", costBrlCents: 5000, at: "2026-10-01T12:00:00Z" }),
        cost({ provider: "deepseek", costBrlCents: 999, at: "2026-09-10T12:00:00Z" }),
      ],
      [rev({}), rev({ status: "pending" }), rev({ refunded: true })],
      now,
    );
    expect(p.todayByProvider).toEqual([["deepseek", 300], ["asaas", 50]]);
    expect(p.monthByProvider[0]).toEqual(["vps", 5000]);
    expect(p.monthTotalCents).toBe(5550);
    expect(p.month.revenueNetCents).toBe(950);
    expect(p.month.costCents).toBe(5500);
    expect(p.month.marginCents).toBe(-4550);
    expect(p.month.events).toBe(2);
    expect(p.month.costPerEventCents).toBe(2750);
    expect(p.trend.map((t) => t.month)).toEqual(lastMonths(now, 6));
    expect(p.trend[4]?.costCents).toBe(999);
  });
  it("dia em SP (UTC-3): 01h UTC conta no dia anterior", () => {
    const p = buildCostsPanel([cost({ at: "2026-10-26T01:00:00Z" })], [], new Date("2026-10-25T20:00:00Z"));
    expect(p.todayTotalCents).toBe(100);
  });
});

describe("saldos e alertas", () => {
  const base = { provider: "deepseek", label: "DeepSeek", thresholdBrlCents: 5000, runwayAlertDays: 7, dailyBurnBrlCents: 1000, lastAlertAt: null };
  it("alerta por saldo baixo e por fôlego curto, com cooldown", () => {
    expect(evaluateBalance({ ...base, balanceBrlCents: 4000 }).kind).toBe("low_balance");
    const r = evaluateBalance({ ...base, balanceBrlCents: 6000 });
    expect(r.kind).toBe("low_runway");
    expect(r.runwayDays).toBe(6);
    expect(evaluateBalance({ ...base, balanceBrlCents: 100_000 }).alert).toBe(false);
    const now = new Date("2026-10-25T12:00:00Z");
    expect(evaluateBalance({ ...base, balanceBrlCents: 10, lastAlertAt: "2026-10-25T00:00:00Z" }, now).alert).toBe(false);
    expect(evaluateBalance({ ...base, balanceBrlCents: null }).alert).toBe(false);
  });
  it("parse das APIs de saldo", () => {
    expect(parseDeepseekBalance({ balance_infos: [{ currency: "USD", total_balance: "10.00" }] }, 5_000_000)?.cents).toBe(5000);
    expect(parseDeepseekBalance({}, 5_000_000)).toBeNull();
    expect(parseAsaasBalance({ balance: 123.45 })?.cents).toBe(12345);
    // 2500 créditos × US$1/1000 = US$2,50 × 5,00 = R$12,50
    expect(parseSerperBalance({ balance: 2500 }, 1_000_000, 5_000_000)).toEqual({ cents: 1250, currency: "credits", raw: 2500 });
    expect(dailyBurn([700, 700], 7)).toBe(200);
    expect(budgetRemaining(10_000, 2_500)).toBe(7_500);
  });
  it("R$ ↔ centavos e preços por requisição", () => {
    expect(parseBrlToCents("1.234,56")).toBe(123456);
    expect(parseBrlToCents("50")).toBe(5000);
    expect(parseBrlToCents("abc")).toBeNull();
    expect(microUsdToBrlCents(brlCentsToMicroUsd(5000, 5_600_000), 5_600_000)).toBe(5000);
    expect(requestsCost("serper", 2)).toBe(2000);
    expect(requestsCost("google_places", 1)).toBe(35_000);
    expect(requestsCost("evolution", 100)).toBe(0);
  });
});

const q = { category: "buffet", categoryLabel: "Buffet", city: "Taubaté", uf: "SP", eventTypeLabel: "Casamento", limit: 5, exclude: [] as string[] };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe("provedores pagos (Serper / Google Places)", () => {
  it("Serper: Maps + Instagram/Facebook, dedupe, cache 24h e medição por requisição", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/places")
        ? json({ places: [{ title: "Buffet A", phoneNumber: "(12) 99123-4567", cid: "1" }, { title: "Buffet A", phoneNumber: "(12) 99123-4567", cid: "1" }] })
        : json({ organic: [{ title: "Buffet B (@buffetb) • Instagram", link: "https://www.instagram.com/buffetb/", snippet: "WhatsApp 12 98888-7777" }, { title: "post", link: "https://www.instagram.com/p/xyz/" }] }),
    );
    const onRequest = vi.fn();
    const p = createSerperProvider({ apiKey: "k", fetchImpl, onRequest });
    const r = await p.search(q);
    expect(r.map((c) => c.name)).toEqual(["Buffet A", "Buffet B"]);
    expect(r[1]?.phone).toBe("+5512988887777");
    await p.search(q);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onRequest).toHaveBeenCalledTimes(2);
  });
  it("Google Places: field mask mínimo e erro 403 vira ProviderQuotaError", async () => {
    let headers: Record<string, string> = {};
    const ok = vi.fn(async (_u: string, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return json({ places: [{ id: "x", displayName: { text: "Buffet C" }, internationalPhoneNumber: "+55 12 3622-1234" }] });
    });
    const r = await createGooglePlacesProvider({ apiKey: "k", fetchImpl: ok }).search(q);
    expect(r[0]?.name).toBe("Buffet C");
    expect(headers["X-Goog-FieldMask"]).not.toContain("reviews");
    expect(headers["X-Goog-FieldMask"]).toContain("places.rating");
    const denied = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(createGooglePlacesProvider({ apiKey: "k", fetchImpl: denied }).search(q)).rejects.toThrow(/sem cota/);
  });
  it("perfis sociais válidos", () => {
    expect(isSocialProfileUrl("https://www.facebook.com/buffetx")).toBe(true);
    expect(isSocialProfileUrl("https://www.facebook.com/groups/abc")).toBe(false);
    expect(socialCandidates(q, [{ title: "X", link: "https://example.com" }])).toEqual([]);
  });
  it("registro: com chaves, Serper/Places entram depois do OSM e antes do mock", () => {
    const names = resolveProviders({ DISCOVERY_PROVIDERS: "overpass,mock", SERPER_API_KEY: "s", GOOGLE_PLACES_API_KEY: "g" }).map((p) => p.name);
    expect(names).toEqual(["overpass", "mock"]);
    const auto = resolveProviders({ SERPER_API_KEY: "s", GOOGLE_PLACES_API_KEY: "g" }).map((p) => p.name);
    expect(auto).toEqual(["serper", "google_places", "mock"]);
    expect(resolveProviders({ DISCOVERY_PROVIDERS: "overpass,serper,mock", SERPER_API_KEY: "s" }).map((p) => p.name)).toEqual(["overpass", "serper", "mock"]);
  });
});
