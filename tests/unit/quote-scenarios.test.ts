import { describe, expect, it } from "vitest";

import { deliverEventQuotes, type DeliveryDeps } from "@/lib/quotes/delivery";
import {
  buildEventScenarios,
  kindFromSlug,
  latestScenarios,
  toSnapshotRows,
  toSupplierQuote,
  type QuotationRowForScenario,
} from "@/lib/quotes/scenarios";

function q(id: string, category: string, amount: number, confidence = 0.9, fees: { amount: number }[] = []): QuotationRowForScenario {
  return {
    id,
    category,
    vendor_name: `Forn ${id}`,
    vendor_contact: "+5512999990000",
    amount_cents: amount,
    fees_cents: fees.reduce((s, f) => s + f.amount, 0),
    confidence,
    needs_followup: false,
    extraction: {
      fees: fees.map((f) => ({ category: "cleaning", description: "limpeza", amount_cents: f.amount, included_in_base: false })),
    },
  };
}

const reqs = [{ category: "buffet" }, { category: "doces" }, { category: "outros" }];

describe("fase 4 — orçamento único de menor preço", () => {
  it("adaptador: total inclui taxas; base = total − taxas", () => {
    const sq = toSupplierQuote(q("a", "buffet", 330000, 0.8, [{ amount: 30000 }]));
    expect(sq).toMatchObject({ basePriceCents: 300000, totalPriceCents: 330000, covers: ["buffet"] });
    expect(sq.fees).toHaveLength(1);
  });

  it("monta um único orçamento com o menor total válido", () => {
    const rows = [q("a", "buffet", 300000, 0.7), q("b", "buffet", 320000, 1), q("c", "doces", 80000, 0.9)];
    const r = buildEventScenarios(reqs, rows);
    expect(r.required).toEqual(["buffet", "doces"]);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(380000);
    expect(Object.keys(r.outcomes)).toEqual(["preco"]);
  });

  it("ignora pendentes/baixa confiança; categoria sem cotação vira 'uncovered' (não zera o orçamento)", () => {
    const rows = [q("a", "buffet", 300000), { ...q("x", "doces", 1000, 0.95), needs_followup: true }, q("y", "doces", 5000, 0.4)];
    const r = buildEventScenarios(reqs, rows);
    expect(r.uncovered).toEqual(["doces"]);
    expect(r.outcomes.preco.scenario?.totalCents).toBe(300000);
  });

  it("snapshot único com contatos e leitura do mais recente", () => {
    const rows = [q("a", "buffet", 300000)];
    const snaps = toSnapshotRows("e", "v1", buildEventScenarios(reqs, rows), rows);
    expect(snaps).toHaveLength(1);
    expect(snaps.map((s) => s.breakdown.label)).toEqual(["Melhor preço"]);
    expect(snaps[0]?.breakdown.contacts.a?.contact).toBe("+5512999990000");
    const latest = latestScenarios([
      { breakdown: snaps[0]?.breakdown, created_at: "2026-10-24T12:00:00Z" },
      { breakdown: { ...snaps[0]?.breakdown, label: "antigo" }, created_at: "2026-10-23T12:00:00Z" },
      { breakdown: { lixo: true }, created_at: "2026-10-22T12:00:00Z" },
    ]);
    expect(latest.preco?.label).toBe("Melhor preço");
    expect(kindFromSlug("melhor-preco")).toBe("preco");
    expect(kindFromSlug("mais-barato")).toBe("preco");
    expect(kindFromSlug("custo-beneficio")).toBe("preco");
    expect(kindFromSlug("mais-pratico")).toBe("preco");
    expect(kindFromSlug("x")).toBeNull();
  });

  it("compatibilidade: snapshots antigos dos outros cenários são ignorados sem erro", () => {
    const rows = [q("a", "buffet", 300000)];
    const snap = toSnapshotRows("e", "v1", buildEventScenarios([{ category: "buffet" }], rows), rows)[0]
      ?.breakdown;
    if (snap === undefined) throw new Error("sem snapshot");
    const legacy = {
      ...snap,
      kind: "comodidade",
      label: "Mais prático",
      outcome: {
        ...snap.outcome,
        kind: "comodidade",
        scenario:
          snap.outcome.scenario === null
            ? null
            : { ...snap.outcome.scenario, kind: "comodidade", scoreCents: 123 },
      },
    };
    const latest = latestScenarios([
      { breakdown: legacy, created_at: "2026-10-25T12:00:00Z" },
      { breakdown: { ...snap, label: "Mais barato" }, created_at: "2026-10-24T12:00:00Z" },
    ]);
    expect(Object.keys(latest)).toEqual(["preco"]);
    expect(latest.preco?.label).toBe("Melhor preço");
  });

  it("entrega idempotente e libera a marca em caso de erro", async () => {
    let claimed = false;
    const inserted: unknown[] = [];
    const deps: DeliveryDeps = {
      engineVersion: "v1",
      claim: () => {
        const ok = !claimed;
        claimed = true;
        return Promise.resolve(ok);
      },
      release: () => {
        claimed = false;
        return Promise.resolve();
      },
      load: () => Promise.resolve({ requirements: reqs, quotations: [q("a", "buffet", 1000)], guestCount: 0 }),
      insertSnapshots: (rows) => {
        inserted.push(...rows);
        return Promise.resolve();
      },
    };
    expect(await deliverEventQuotes(deps, "e")).toEqual({ status: "delivered", scenarios: 1 });
    expect(await deliverEventQuotes(deps, "e")).toEqual({ status: "already_delivered" });
    expect(inserted).toHaveLength(1);
    claimed = false;
    deps.insertSnapshots = () => Promise.reject(new Error("db"));
    await expect(deliverEventQuotes(deps, "e")).rejects.toThrow("db");
    expect(claimed).toBe(false);
  });
});

it("C_total soma per_guest_cents × guestCount no orçamento", () => {
    const row = {
      ...q("a", "buffet", 300000),
      extraction: { fees: [], quotation: { per_guest_cents: 5000 } },
    };
    const withGuests = buildEventScenarios(reqs, [row], 100);
    expect(withGuests.outcomes.preco.scenario?.totalCents).toBe(800_000); // 300000 + 5000×100
    const withoutGuests = buildEventScenarios(reqs, [row], 0);
    expect(withoutGuests.outcomes.preco.scenario?.totalCents).toBe(300_000);
  });
