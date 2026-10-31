import { describe, expect, it } from "vitest";

import { buildEventCosts, estimateAsaasFeeCents, isEstimated, parseEventCostSort } from "@/lib/finance/event-costs";
import type { CostRow, RevenueRow } from "@/lib/finance/report";

const cost = (o: Partial<CostRow>): CostRow => ({
  at: "2026-10-10T10:00:00Z", provider: "serper", reason: "discovery", kind: "variable", eventId: "e1",
  costMicroUsd: 0, costBrlCents: 1, inputTokens: 0, outputTokens: 0, detail: "", ...o,
});
const pay = (o: Partial<RevenueRow>): RevenueRow => ({
  at: "2026-10-10T12:00:00Z", paymentId: "p", clientId: "c", clientLabel: "c", plan: "x", eventId: "e1",
  grossCents: 9700, feeCents: 0, netCents: 9700, status: "confirmed", refunded: false, ...o,
});

describe("estimateAsaasFeeCents", () => {
  it("Pix R$ 0,99; cartão R$ 0,49 + 1,99%; cortesia 0", () => {
    expect(estimateAsaasFeeCents(9700, "PIX")).toBe(99);
    expect(estimateAsaasFeeCents(9700, "CREDIT_CARD")).toBe(49 + 193);
    expect(estimateAsaasFeeCents(0, "COURTESY")).toBe(0);
  });
});

describe("isEstimated", () => {
  it("usa a marca gravada; legado infere pelo provedor", () => {
    expect(isEstimated({ provider: "deepseek", kind: "variable", estimated: true })).toBe(true);
    expect(isEstimated({ provider: "serper", kind: "variable" })).toBe(true);
    expect(isEstimated({ provider: "deepseek", kind: "variable" })).toBe(false);
    expect(isEstimated({ provider: "vps", kind: "fixed" })).toBe(false);
  });
});

describe("buildEventCosts", () => {
  const costs = [
    cost({ provider: "serper", quantity: 12, costBrlCents: 7 }),
    cost({ provider: "google_places", quantity: 3, costBrlCents: 57 }),
    cost({ provider: "deepseek", costBrlCents: 20 }),
    cost({ provider: "deepseek", costBrlCents: 10 }),
    cost({ provider: "resend", quantity: 5, costBrlCents: 0, estimated: true }),
    cost({ provider: "vps", kind: "fixed", costBrlCents: 5000 }),
    cost({ eventId: "e2", provider: "serper", costBrlCents: 500 }),
    cost({ eventId: null, provider: "resend", costBrlCents: 1 }),
  ];
  it("soma por ferramenta com chamadas, separa real/estimado e calcula margem", () => {
    const [e1] = buildEventCosts(costs, [pay({ billingType: "PIX" })], { e1: "Casamento" }).filter((e) => e.eventId === "e1");
    expect(e1).toBeDefined();
    expect(e1.title).toBe("Casamento");
    const t = Object.fromEntries(e1.tools.map((x) => [x.provider, x]));
    expect(t.serper).toMatchObject({ calls: 12, cents: 7, basis: "estimado" });
    expect(t.google_places).toMatchObject({ calls: 3, cents: 57 });
    expect(t.deepseek).toMatchObject({ calls: 2, cents: 30, basis: "real" });
    expect(t.asaas).toMatchObject({ calls: 1, cents: 99, basis: "estimado" });
    expect(t.vps).toBeUndefined();
    expect(e1.costCents).toBe(7 + 57 + 30 + 0 + 99);
    expect(e1.revenueCents).toBe(9700);
    expect(e1.marginCents).toBe(9700 - 193);
  });
  it("taxa Asaas real quando o webhook informou; estornos não contam", () => {
    const [e1] = buildEventCosts([], [pay({ feeCents: 120, feeKnown: true }), pay({ paymentId: "r", refunded: true })], {});
    expect(e1.tools).toEqual([{ provider: "asaas", calls: 1, cents: 120, estimatedCents: 0, basis: "real" }]);
    expect(e1.revenueCents).toBe(9700);
  });
  it("ordena por custo, margem, receita", () => {
    const rows = buildEventCosts(costs, [pay({ billingType: "PIX" })], {}, "custo");
    expect(rows.map((r) => r.eventId)).toEqual(["e2", "e1"]);
    expect(buildEventCosts(costs, [pay({})], {}, "margem")[0].eventId).toBe("e2");
    expect(buildEventCosts(costs, [pay({})], {}, "receita")[0].eventId).toBe("e1");
    expect(parseEventCostSort("xx")).toBe("custo");
    expect(parseEventCostSort("margem")).toBe("margem");
  });
});
