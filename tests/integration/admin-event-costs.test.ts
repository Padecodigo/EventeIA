import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: custo por evento (loadFinance → buildEventCosts), atribuição de event_id na medição
 * de e-mail e exclusão recuperável (soft delete) de custos fixos/alertas.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const updates: { table: string; values: Row; ops: [string, string, unknown][] }[] = [];
const requireAdmin = vi.fn(() => Promise.resolve({ id: "11111111-1111-1111-1111-111111111111", email: "a@x" }));
const recorded: Row[] = [];

function from(table: string) {
  const ops: [string, string, unknown][] = [];
  let pending: Row | null = null;
  const run = () =>
    (tables[table] ?? []).filter((r) =>
      ops.every(([op, col, v]) => {
        const x = r[col];
        if (op === "eq" || op === "is") return (x ?? null) === v;
        if (op === "gte") return String(x) >= String(v);
        if (op === "lte") return String(x) <= String(v);
        if (op === "in") return (v as unknown[]).includes(x);
        return true;
      }),
    );
  const b = {
    select: () => b, order: () => b, limit: () => b,
    update: (v: Row) => ((pending = v), b),
    eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), b),
    is: (c: string, v: unknown) => (ops.push(["is", c, v]), b),
    gte: (c: string, v: unknown) => (ops.push(["gte", c, v]), b),
    lte: (c: string, v: unknown) => (ops.push(["lte", c, v]), b),
    in: (c: string, v: unknown) => (ops.push(["in", c, v]), b),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      if (pending !== null) {
        const hit = run();
        hit.forEach((r) => Object.assign(r, pending));
        updates.push({ table, values: pending, ops });
        return Promise.resolve({ data: hit, error: null }).then(res);
      }
      return Promise.resolve({ data: run(), error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => Promise.resolve({ from }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/finance/runtime", () => ({
  currentPrices: async () => (await import("@/lib/finance/pricing")).DEFAULT_FINANCE_PRICES,
  recordCostEntry: (e: Row) => { recorded.push(e); return Promise.resolve(); },
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}), isConfigured: () => false }));

const EV = "71e24ebd-0000-4000-8000-000000000001";

beforeEach(() => {
  updates.length = 0;
  recorded.length = 0;
  tables.llm_usage_events = [
    { created_at: "2026-10-10T10:00:00Z", provider: "deepseek", task: "quotation_extraction", reason: null, event_id: EV, input_tokens: 1000, output_tokens: 100, cache_hit_tokens: 0, cost_micro_usd: 2000, cost_brl_cents: 3, fx_brl_per_usd_micro: 5_600_000, peak: false, outcome: "ok" },
  ];
  tables.cost_entries = [
    { id: "a", occurred_at: "2026-10-10T10:00:00Z", provider: "serper", kind: "variable", reason: "discovery", event_id: EV, quantity: 12, cost_micro_usd: 12000, cost_brl_cents: 7, note: null, is_estimate: true, deleted_at: null },
    { id: "b", occurred_at: "2026-10-10T10:00:00Z", provider: "google_places", kind: "variable", reason: "discovery", event_id: EV, quantity: 2, cost_micro_usd: 70000, cost_brl_cents: 39, note: null, is_estimate: null, deleted_at: null },
    { id: "22222222-2222-4222-8222-222222222222", occurred_at: "2026-10-01T00:00:00Z", provider: "vps", kind: "fixed", reason: "fixed", event_id: null, quantity: 1, cost_micro_usd: 1, cost_brl_cents: 5000, note: null, is_estimate: null, deleted_at: null },
    { id: "33333333-3333-4333-8333-333333333333", occurred_at: "2026-10-02T00:00:00Z", provider: "vps", kind: "variable", reason: "x", event_id: null, quantity: 1, cost_micro_usd: 1, cost_brl_cents: 1, note: null, is_estimate: null, deleted_at: null },
  ];
  tables.payments = [
    { id: "p1", profile_id: "u1", purpose: "event_ticket", event_id: EV, amount_cents: 9700, asaas_fee_cents: null, net_cents: null, status: "confirmed", created_at: "2026-10-09T10:00:00Z", confirmed_at: "2026-10-09T10:01:00Z", refunded_at: null, billing_type: "PIX" },
  ];
  tables.profiles = [{ id: "u1", display_name: "Cliente" }];
  tables.events = [{ id: EV, title: "Evento de teste" }];
  tables.finance_alerts = [{ id: "44444444-4444-4444-8444-444444444444", provider: "asaas", kind: "low_balance", created_at: "2026-10-10T00:00:00Z", deleted_at: null }];
});

describe("custo por evento", () => {
  it("loadFinance + buildEventCosts: ferramentas, chamadas, real × estimado, receita e margem", async () => {
    const { loadFinance } = await import("@/lib/finance/load");
    const { buildEventCosts } = await import("@/lib/finance/event-costs");
    const data = await loadFinance({ from: "2026-10-01", to: "2026-10-31" });
    const [ev] = buildEventCosts(data.costs, data.revenue, data.eventTitles);
    expect(requireAdmin).toHaveBeenCalled();
    expect(ev).toMatchObject({ eventId: EV, title: "Evento de teste", revenueCents: 9700 });
    const t = Object.fromEntries(ev.tools.map((x) => [x.provider, x]));
    expect(t.serper).toMatchObject({ calls: 12, cents: 7, basis: "estimado" });
    expect(t.google_places).toMatchObject({ calls: 2, cents: 39, basis: "estimado" });
    expect(t.deepseek).toMatchObject({ calls: 1, cents: 3, basis: "real" });
    expect(t.asaas).toMatchObject({ calls: 1, cents: 99, basis: "estimado" });
    expect(ev.costCents).toBe(7 + 39 + 3 + 99);
    expect(ev.marginCents).toBe(9700 - 148);
  });

  it("custos excluídos (deleted_at) somem do painel", async () => {
    tables.cost_entries[0].deleted_at = "2026-10-11T00:00:00Z";
    const { loadFinance } = await import("@/lib/finance/load");
    const data = await loadFinance({ from: "2026-10-01", to: "2026-10-31" });
    expect(data.costs.some((c) => c.provider === "serper")).toBe(false);
  });
});

describe("medição com event_id", () => {
  it("e-mail via Resend grava o evento informado", async () => {
    const { createResendAdapter } = await import("@/lib/notifications/email");
    const fetchImpl = (() => Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }))) as typeof fetch;
    await createResendAdapter({ apiKey: "k", from: "f@x", fetchImpl }).send({ to: "a@b.com", subject: "s", text: "t", eventId: EV });
    await vi.waitFor(() => expect(recorded).toHaveLength(1));
    expect(recorded[0]).toMatchObject({ provider: "resend", event_id: EV, is_estimate: true });
  });
});

describe("exclusão recuperável", () => {
  const form = (target: string, ids: string[]) => {
    const f = new FormData();
    f.set("target", target);
    ids.forEach((i) => f.append("id", i));
    return f;
  };
  it("custo fixo: marca deleted_at/deleted_by só em kind = fixed (variável fica intacto)", async () => {
    const { softDeleteAction } = await import("@/app/admin/custos/actions");
    const r = await softDeleteAction({}, form("fixed", ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]));
    expect(r.success).toBeDefined();
    expect(requireAdmin).toHaveBeenCalled();
    const fixed = tables.cost_entries.find((c) => c.kind === "fixed")!;
    const variable = tables.cost_entries.find((c) => c.id === "33333333-3333-4333-8333-333333333333")!;
    expect(fixed.deleted_at).toEqual(expect.any(String));
    expect(fixed.deleted_by).toBe("11111111-1111-1111-1111-111111111111");
    expect(variable.deleted_at).toBeNull();
    expect(tables.cost_entries).toHaveLength(4); // nada apagado de verdade
  });
  it("alertas: limpar histórico marca todos os IDs confirmados", async () => {
    const { softDeleteAction } = await import("@/app/admin/custos/actions");
    await softDeleteAction({}, form("alert", ["44444444-4444-4444-8444-444444444444"]));
    expect(tables.finance_alerts[0].deleted_at).toEqual(expect.any(String));
  });
  it("rejeita alvo/IDs inválidos e exige admin", async () => {
    const { softDeleteAction } = await import("@/app/admin/custos/actions");
    expect((await softDeleteAction({}, form("payments", ["22222222-2222-4222-8222-222222222222"]))).error).toBeDefined();
    expect((await softDeleteAction({}, form("fixed", ["nao-uuid"]))).error).toBeDefined();
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(softDeleteAction({}, form("fixed", ["22222222-2222-4222-8222-222222222222"]))).rejects.toThrow();
    expect(updates).toHaveLength(0);
  });
});
