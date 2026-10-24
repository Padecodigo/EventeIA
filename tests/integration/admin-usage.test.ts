import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração de lib/usage/load + /admin/consumo/csv (Supabase e auth mockados).
 * O "banco" falso aplica os filtros eq/is/gte/lte/in que o loader envia.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const queries: { table: string; ops: [string, string, unknown][] }[] = [];
const requireAdmin = vi.fn(async () => ({ id: "admin", email: "a@x" }));

function from(table: string) {
  const ops: [string, string, unknown][] = [];
  queries.push({ table, ops });
  const run = () =>
    (tables[table] ?? []).filter((r) =>
      ops.every(([op, col, v]) => {
        const x = r[col];
        if (op === "eq") return x === v;
        if (op === "is") return x === v;
        if (op === "gte") return String(x) >= String(v);
        if (op === "lte") return String(x) <= String(v);
        if (op === "in") return (v as unknown[]).includes(x);
        return true;
      }),
    );
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), b),
    is: (c: string, v: unknown) => (ops.push(["is", c, v]), b),
    gte: (c: string, v: unknown) => (ops.push(["gte", c, v]), b),
    lte: (c: string, v: unknown) => (ops.push(["lte", c, v]), b),
    in: (c: string, v: unknown) => (ops.push(["in", c, v]), b),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
  };
  return b;
}

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ from }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

const { loadUsage } = await import("@/lib/usage/load");
const { GET } = await import("@/app/admin/consumo/csv/route");
const { parseUsageFilters, buildUsageReport } = await import("@/lib/usage/report");

const OWNER = "33333333-3333-3333-3333-333333333333";
const EV = "44444444-4444-4444-4444-444444444444";
const usage = (o: Row): Row => ({
  created_at: "2026-10-10T10:00:00Z", provider: "deepseek", task: "quotation_extraction", outcome: "ok",
  profile_id: null, event_id: EV, stage: "quote_collection", whatsapp_channel: null,
  input_tokens: 1000, output_tokens: 100, cost_micro_usd: 2000, cost_brl_cents: null, fx_brl_per_usd_micro: 5_000_000, ...o,
});

beforeEach(() => {
  queries.length = 0;
  requireAdmin.mockClear();
  tables.llm_usage_events = [
    usage({}),
    usage({ task: "discovery_search", provider: "grok", stage: "discovery", event_id: null, cost_brl_cents: 9 }),
    usage({ created_at: "2026-08-01T00:00:00Z" }),
  ];
  tables.events = [{ id: EV, title: "Casamento", owner_profile_id: OWNER, whatsapp_channel: "evolution" }];
  tables.profiles = [{ id: OWNER, display_name: "Ana" }];
  tables.event_outcomes = [{ event_id: EV, closed_outside_at: "2026-10-12T00:00:00Z", closed_outside_stage: "quote_collection", whatsapp_channel: null, closed_outside: true }];
});

const now = new Date("2026-10-24T12:00:00Z");

describe("loadUsage", () => {
  it("exige admin, herda dono/canal do evento e lista fechamentos por fora", async () => {
    const data = await loadUsage(parseUsageFilters({ from: "2026-10-01", to: "2026-10-24" }, now));
    expect(requireAdmin).toHaveBeenCalled();
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]).toMatchObject({ profileId: OWNER, channel: "evolution", costBrlCents: 1 });
    expect(data.userLabels[OWNER]).toBe("Ana");
    expect(data.closedOutside).toEqual([{ eventId: EV, at: "2026-10-12T00:00:00Z", stage: "quote_collection", channel: "evolution" }]);
    const r = buildUsageReport(data.rows, parseUsageFilters({ from: "2026-10-01", to: "2026-10-24", user: OWNER }, now));
    expect(r.totals.calls).toBe(1);
  });
  it("envia task/provedor/estágio para a query", async () => {
    await loadUsage(parseUsageFilters({ task: "negotiation", provider: "nim", stage: "none" }, now));
    const ops = queries.find((q) => q.table === "llm_usage_events")?.ops ?? [];
    expect(ops).toEqual(expect.arrayContaining([["eq", "task", "negotiation"], ["eq", "provider", "nim"], ["is", "stage", null]]));
  });
  it("bloqueia não-admin", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(loadUsage(parseUsageFilters({}, now))).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("GET /admin/consumo/csv", () => {
  it("exporta só as linhas filtradas, com cabeçalho e no-store", async () => {
    const res = await GET(new Request("http://x/admin/consumo/csv?from=2026-10-01&to=2026-10-24&channel=evolution"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const lines = (await res.text()).replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0]).toContain("operacao;resultado;estagio;canal_whatsapp");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("quotation_extraction;ok;quote_collection;evolution");
    expect(lines[1]).toContain(";0,01");
  });
});
