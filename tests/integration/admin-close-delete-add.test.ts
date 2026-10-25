import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: chamados (encerrar/reabrir/excluir), detalhamento (excluir/limpar), custo fixo (adicionar/recorrente). */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const ADMIN = "11111111-1111-4111-8111-111111111111";
const requireAdmin = vi.fn(() => Promise.resolve({ id: ADMIN, email: "a@x" }));

function from(table: string) {
  const ops: [string, string, unknown][] = [];
  let patch: Row | null = null;
  let ins: Row | null = null;
  const run = () => (tables[table] ?? []).filter((r) => ops.every(([op, c, v]) => {
    const x = r[c] ?? null;
    if (op === "eq" || op === "is") return x === v;
    if (op === "neq") return x !== v;
    if (op === "in") return (v as unknown[]).includes(x);
    if (op === "gte") return (x as string) >= (v as string);
    if (op === "lte") return (x as string) <= (v as string);
    return true;
  }));
  const b = {
    select: () => b, order: () => b, limit: () => b,
    update: (v: Row) => ((patch = v), b),
    insert: (v: Row) => ((ins = v), b),
    eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), b),
    neq: (c: string, v: unknown) => (ops.push(["neq", c, v]), b),
    is: (c: string, v: unknown) => (ops.push(["is", c, v]), b),
    in: (c: string, v: unknown) => (ops.push(["in", c, v]), b),
    gte: (c: string, v: unknown) => (ops.push(["gte", c, v]), b),
    lte: (c: string, v: unknown) => (ops.push(["lte", c, v]), b),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      if (ins) { (tables[table] ??= []).push({ id: `new-${String(tables[table].length)}`, deleted_at: null, ...ins }); return Promise.resolve({ data: [], error: null }).then(res); }
      const hit = run();
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return Promise.resolve({ data: hit, error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => Promise.resolve({ from }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/finance/runtime", () => ({ currentFxMicro: () => Promise.resolve(5_000_000), currentPrices: () => Promise.resolve({}) }));
vi.mock("@/lib/support/runtime", () => ({ createSupportDeps: () => ({}) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}), isConfigured: () => false }));

const T = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";
const L1 = "66666666-6666-4666-8666-666666666666";
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };

beforeEach(() => {
  requireAdmin.mockClear();
  tables.support_tickets = [{ id: T, status: "aberto", deleted_at: null, closed_at: null, closed_by: null }];
  tables.cost_entries = [
    { id: C1, provider: "serper", kind: "variable", occurred_at: "2026-10-10T10:00:00Z", deleted_at: null },
    { id: C2, provider: "google_places", kind: "variable", occurred_at: "2026-09-10T10:00:00Z", deleted_at: null },
  ];
  tables.llm_usage_events = [{ id: L1, provider: "deepseek", created_at: "2026-10-11T10:00:00Z", deleted_at: null }];
  tables.payments = [{ id: "p1", created_at: "2026-10-10T10:00:00Z" }];
});

describe("chamados", () => {
  it("encerrar registra quem/quando; reabrir limpa; excluir é soft delete", async () => {
    const a = await import("@/app/admin/chamados/actions");
    expect(await a.adminCloseTicketAction(null, fd({ ticketId: T }))).toEqual({ ok: true });
    const t = tables.support_tickets[0];
    expect(t.status).toBe("fechado");
    expect(t.closed_by).toBe(ADMIN);
    expect(t.closed_at).toEqual(expect.any(String));
    await a.adminReopenTicketAction(null, fd({ ticketId: T }));
    expect(t).toMatchObject({ status: "aberto", closed_at: null, closed_by: null });
    await expect(a.adminDeleteTicketAction(null, fd({ ticketId: T }))).rejects.toThrow("REDIRECT");
    expect(t.deleted_by).toBe(ADMIN);
    expect(tables.support_tickets).toHaveLength(1);
  });
  it("exige admin e ID válido", async () => {
    const a = await import("@/app/admin/chamados/actions");
    expect((await a.adminCloseTicketAction(null, fd({ ticketId: "x" })))?.ok).toBe(false);
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(a.adminCloseTicketAction(null, fd({ ticketId: T }))).rejects.toThrow();
  });
});

describe("detalhamento do financeiro", () => {
  it("excluir uma linha marca só ela; pagamentos intactos", async () => {
    const a = await import("@/app/admin/financeiro/actions");
    const r = await a.deleteCostRowsAction({}, fd({ ref: [`c:${C1}`, `l:${L1}`] }));
    expect(r.success).toBeDefined();
    expect(tables.cost_entries[0].deleted_by).toBe(ADMIN);
    expect(tables.cost_entries[1].deleted_at).toBeNull();
    expect(tables.llm_usage_events[0].deleted_at).toEqual(expect.any(String));
    expect(tables.payments[0]).toEqual({ id: "p1", created_at: "2026-10-10T10:00:00Z" });
  });
  it("limpar por período e provedor", async () => {
    const a = await import("@/app/admin/financeiro/actions");
    await a.clearCostPeriodAction({}, fd({ from: "2026-10-01", to: "2026-10-31", provider: "deepseek" }));
    expect(tables.llm_usage_events[0].deleted_at).toEqual(expect.any(String));
    expect(tables.cost_entries[0].deleted_at).toBeNull();
    await a.clearCostPeriodAction({}, fd({ from: "2026-10-01", to: "2026-10-31", provider: "" }));
    expect(tables.cost_entries[0].deleted_at).toEqual(expect.any(String));
    expect(tables.cost_entries[1].deleted_at).toBeNull(); // setembro fica
    expect((await a.deleteCostRowsAction({}, fd({ ref: "p:p1" }))).error).toBeDefined();
  });
});

describe("custos fixos", () => {
  it("adicionar em R$ com 'repete todo mês' e cópia automática do mês seguinte", async () => {
    const a = await import("@/app/admin/custos/actions");
    const r = await a.addFixedCostBrlAction({}, fd({ provider: "vps", amount: "100,00", month: "2026-10", recurring: "on" }));
    expect(r.success).toMatch(/repete/);
    const row = tables.cost_entries.at(-1)!;
    expect(row).toMatchObject({ provider: "vps", kind: "fixed", cost_brl_cents: 10_000, recurring: true, created_by: ADMIN, occurred_at: "2026-10-01T12:00:00Z" });
    const { copyRecurringFixed } = await import("@/lib/finance/balance-monitor");
    expect(await copyRecurringFixed(new Date("2026-11-02T15:00:00Z"))).toBe(1);
    expect(await copyRecurringFixed(new Date("2026-11-03T15:00:00Z"))).toBe(0); // idempotente
    expect(tables.cost_entries.filter((c) => c.provider === "vps")).toHaveLength(2);
  });
  it("'Outro' exige nome; valor inválido é recusado", async () => {
    const a = await import("@/app/admin/custos/actions");
    expect((await a.addFixedCostBrlAction({}, fd({ provider: "other", amount: "10", month: "2026-10" }))).error).toMatch(/nome/);
    expect((await a.addFixedCostBrlAction({}, fd({ provider: "vps", amount: "abc", month: "2026-10" }))).error).toBeDefined();
  });
});
