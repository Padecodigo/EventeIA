import { describe, expect, it } from "vitest";

import {
  deepseekCost,
  isDeepseekPeak,
  microUsdToBrlCents,
  microUsdToUsdCents,
  parseFxToMicro,
  requestsCost,
  resolvePrices,
} from "@/lib/finance/pricing";
import { asaasFeeFromPayload, buildReport, resolvePeriod, type CostRow, type RevenueRow } from "@/lib/finance/report";

describe("custo DeepSeek pico/fora de pico", () => {
  it("janelas de pico: seg–sex 01–04 e 06–10 UTC", () => {
    expect(isDeepseekPeak(new Date("2026-10-26T01:00:00Z"))).toBe(true); // segunda
    expect(isDeepseekPeak(new Date("2026-10-26T03:59:59Z"))).toBe(true);
    expect(isDeepseekPeak(new Date("2026-10-26T04:00:00Z"))).toBe(false);
    expect(isDeepseekPeak(new Date("2026-10-26T05:30:00Z"))).toBe(false);
    expect(isDeepseekPeak(new Date("2026-10-30T09:59:00Z"))).toBe(true); // sexta
    expect(isDeepseekPeak(new Date("2026-10-26T10:00:00Z"))).toBe(false);
    expect(isDeepseekPeak(new Date("2026-10-24T02:00:00Z"))).toBe(false); // sábado
    expect(isDeepseekPeak(new Date("2026-10-25T07:00:00Z"))).toBe(false); // domingo
  });

  it("1M de cada tipo: fora de pico = US$0,753; pico = US$1,506", () => {
    const u = { cacheHitTokens: 1_000_000, cacheMissTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(deepseekCost(u, new Date("2026-10-26T12:00:00Z"))).toEqual({ costMicroUsd: 753_000, peak: false });
    expect(deepseekCost(u, new Date("2026-10-26T07:00:00Z"))).toEqual({ costMicroUsd: 1_506_000, peak: true });
  });

  it("chamada típica (2k miss, 500 hit, 300 out) com arredondamento half-up", () => {
    // 500*3000 + 2000*150000 + 300*600000 = 481_500_000 / 1e6 = 481,5 → 482
    expect(deepseekCost({ cacheHitTokens: 500, cacheMissTokens: 2000, outputTokens: 300 }, new Date("2026-10-26T15:00:00Z")).costMicroUsd).toBe(482);
  });

  it("search/fetch: US$0,75 por 1000 sucessos", () => {
    expect(requestsCost("search", 1000)).toBe(750_000);
    expect(requestsCost("fetch", 1)).toBe(750);
    expect(requestsCost("fetch", -3)).toBe(0);
  });

  it("conversões USD/BRL e câmbio", () => {
    expect(microUsdToUsdCents(753_000)).toBe(75);
    expect(microUsdToBrlCents(1_000_000, 5_600_000)).toBe(560);
    expect(microUsdToBrlCents(482, 5_600_000)).toBe(0);
    expect(parseFxToMicro("5,60")).toBe(5_600_000);
    expect(parseFxToMicro("5.4321")).toBe(5_432_100);
    expect(parseFxToMicro("abc")).toBeNull();
  });

  it("preços configuráveis: admin > env > padrão; chaves inválidas ignoradas", () => {
    const p = resolvePrices('{"search.per_1k": 800000, "lixo": 1}', [{ key: "deepseek.out.peak", micro_usd: 1_000_000 }, { key: "x", micro_usd: 1 }]);
    expect(p["search.per_1k"]).toBe(800_000); // chave inválida "lixo" ignorada
    expect(p["deepseek.out.peak"]).toBe(1_000_000);
    expect(resolvePrices('{"search.per_1k": 800000}')["search.per_1k"]).toBe(800_000);
    expect(resolvePrices("{quebrado")["fetch.per_1k"]).toBe(750_000);
  });
});

describe("relatório financeiro", () => {
  const cost = (p: Partial<CostRow>): CostRow => ({
    at: "2026-10-20T10:00:00Z", provider: "deepseek", reason: "extraction", kind: "variable", eventId: "e1",
    costMicroUsd: 1000, costBrlCents: 100, inputTokens: 0, outputTokens: 0, detail: "", ...p,
  });
  const pay = (p: Partial<RevenueRow>): RevenueRow => ({
    at: "2026-10-20T12:00:00Z", paymentId: "p", clientId: "c1", clientLabel: "Ana", plan: "Tíquete avulso",
    eventId: "e1", grossCents: 4990, feeCents: 199, netCents: 4791, status: "confirmed", refunded: false, ...p,
  });

  it("totais, lucro, margem, custo médio por evento e rankings", () => {
    const r = buildReport(
      [cost({}), cost({ eventId: "e2", costBrlCents: 300, reason: "discovery", provider: "search" }), cost({ kind: "fixed", provider: "vps", eventId: null, costBrlCents: 3000, reason: "fixed_monthly" })],
      [pay({}), pay({ status: "pending" }), pay({ refunded: true, status: "refunded" }), pay({ clientLabel: "Bia", plan: "Plano Pro", grossCents: 10000, feeCents: 0, netCents: 10000 })],
    );
    expect(r.costBrlCents).toBe(3400);
    expect(r.fixedBrlCents).toBe(3000);
    expect(r.netCents).toBe(14791);
    expect(r.feeCents).toBe(199);
    expect(r.refundedCents).toBe(4990);
    expect(r.profitCents).toBe(11391);
    expect(r.marginBps).toBe(Math.round((11391 * 10000) / 14791));
    expect(r.avgCostPerEventCents).toBe(200);
    expect(r.byEvent[0]).toEqual(["e2", 300]);
    expect(r.revenueByClient[0]).toEqual(["Bia", 10000]);
    expect(r.paymentsCount).toBe(2);
  });

  it("sem receita: margem null", () => {
    expect(buildReport([cost({})], []).marginBps).toBeNull();
  });

  it("taxa Asaas a partir do netValue", () => {
    expect(asaasFeeFromPayload(4990, 47.91)).toEqual({ feeCents: 199, netCents: 4791 });
    expect(asaasFeeFromPayload(4990, undefined)).toEqual({ feeCents: 0, netCents: 4990 });
    expect(asaasFeeFromPayload(4990, 99)).toEqual({ feeCents: 0, netCents: 4990 });
  });

  it("período padrão = mês corrente; datas invertidas são trocadas", () => {
    expect(resolvePeriod(undefined, undefined, new Date("2026-10-24T13:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-24" });
    expect(resolvePeriod("2026-10-10", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });
});
