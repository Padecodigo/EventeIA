import { describe, expect, it } from "vitest";

import { donutSlices, eventFunnel, eventsByCity, eventsByType, marginByEvent, polylinePoints, revenueCostSeries, type EventStatRow } from "@/lib/finance/analytics";
import type { CostRow, RevenueRow } from "@/lib/finance/report";

const E1 = "3f1c2a4e-8b7d-4c1a-9e2f-1a2b3c4d5e6f";
const E2 = "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";

function cost(eventId: string | null, cents: number): CostRow {
  return { at: "2026-10-01T10:00:00Z", provider: "deepseek", reason: "extraction", kind: "variable", eventId, costMicroUsd: 0, costBrlCents: cents, inputTokens: 0, outputTokens: 0, detail: "" };
}
function rev(eventId: string | null, net: number, status = "confirmed", refunded = false): RevenueRow {
  return { at: "2026-10-01T10:00:00Z", paymentId: `${eventId ?? "x"}-${String(net)}`, clientId: "c", clientLabel: "c", plan: "p", eventId, grossCents: net, feeCents: 0, netCents: net, status, refunded };
}

describe("revenueCostSeries", () => {
  it("une dias e ordena cronologicamente", () => {
    expect(revenueCostSeries([["2026-10-02", 500]], [["2026-10-01", 100], ["2026-10-02", 50]])).toEqual([
      { day: "2026-10-01", revenueCents: 0, costCents: 100 },
      { day: "2026-10-02", revenueCents: 500, costCents: 50 },
    ]);
  });
});

describe("marginByEvent", () => {
  it("ignora estornos/pendentes e ordena pela pior margem", () => {
    const m = marginByEvent([cost(E1, 300), cost(E2, 100), cost(null, 999)], [rev(E1, 200), rev(E2, 9700), rev(E2, 9700, "pending"), rev(E2, 9700, "confirmed", true)]);
    expect(m).toEqual([
      { eventId: E1, revenueCents: 200, costCents: 300, marginCents: -100 },
      { eventId: E2, revenueCents: 9700, costCents: 100, marginCents: 9600 },
    ]);
  });
});

describe("funil e distribuição", () => {
  const ev = (id: string, status: string, delivered: boolean, type = "casamento", city: string | null = "Taubaté"): EventStatRow => ({ id, eventType: type, city, status, quotesDeliveredAt: delivered ? "2026-10-03T00:00:00Z" : null });
  const events = [ev("a", "draft", false, "festa_infantil", "São José dos Campos"), ev("b", "active", true), ev("c", "awaiting_payment", false, "casamento", null), ev("d", "completed", true)];

  it("conta criado → pago → entregue (pagamento confirmado também conta)", () => {
    expect(eventFunnel(events, new Set(["c"]))).toEqual({ created: 4, paid: 3, delivered: 2 });
  });

  it("entregue sem pagamento não conta no funil", () => {
    expect(eventFunnel([ev("x", "draft", true)], new Set())).toEqual({ created: 1, paid: 0, delivered: 0 });
  });

  it("agrupa por tipo e cidade", () => {
    expect(eventsByType(events)).toEqual([["casamento", 3], ["festa_infantil", 1]]);
    expect(eventsByCity(events)).toEqual([["Taubaté", 2], ["São José dos Campos", 1], ["Sem cidade", 1]]);
  });
});

describe("geometria SVG", () => {
  it("polyline escala e inverte o eixo y", () => {
    expect(polylinePoints([0, 50, 100], 200, 100, 100)).toBe("0.0,100.0 100.0,50.0 200.0,0.0");
    expect(polylinePoints([], 200, 100, 1)).toBe("");
    expect(polylinePoints([5], 200, 100, 10)).toBe("100.0,50.0");
  });

  it("donut soma a circunferência e agrupa o excedente em Outros", () => {
    const rows: [string, number][] = [["a", 40], ["b", 30], ["c", 10], ["d", 10], ["e", 5], ["f", 3], ["g", 2], ["z", 0]];
    const s = donutSlices(rows, 100);
    expect(s).toHaveLength(6);
    expect(s.at(-1)?.key).toBe("Outros");
    expect(s.reduce((acc, x) => acc + x.fraction, 0)).toBeCloseTo(1);
    expect(s[1]?.offset).toBeCloseTo(-40);
    expect(donutSlices([["a", 0]], 100)).toEqual([]);
  });
});
