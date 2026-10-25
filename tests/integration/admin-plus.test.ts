import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: lixeira (restaurar), aviso de vencimento da VPS (e-mail único), CSV por evento. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const requireAdmin = vi.fn(() => Promise.resolve({ id: "admin", email: "a@x" }));
const send = vi.fn((_m: unknown) => Promise.resolve());

function from(table: string) {
  const ops: [string, string, unknown][] = [];
  let patch: Row | null = null;
  let single = false;
  const run = () => (tables[table] ?? []).filter((r) => ops.every(([op, c, v]) => {
    const x = r[c] ?? null;
    if (op === "eq" || op === "is") return x === v;
    if (op === "not") return x !== v;
    if (op === "in") return (v as unknown[]).includes(x);
    if (op === "gte") return (x as string) >= (v as string);
    if (op === "lte") return (x as string) <= (v as string);
    return true;
  }));
  const b = {
    select: () => b, order: () => b, limit: () => b,
    maybeSingle: () => ((single = true), b),
    update: (v: Row) => ((patch = v), b),
    eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), b),
    is: (c: string, v: unknown) => (ops.push(["is", c, v]), b),
    not: (c: string, _o: string, v: unknown) => (ops.push(["not", c, v]), b),
    in: (c: string, v: unknown) => (ops.push(["in", c, v]), b),
    gte: (c: string, v: unknown) => (ops.push(["gte", c, v]), b),
    lte: (c: string, v: unknown) => (ops.push(["lte", c, v]), b),
    then: (res: (v: { data: unknown; error: null }) => unknown) => {
      const hit = run();
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return Promise.resolve({ data: single ? hit[0] ?? null : hit, error: null }).then(res);
    },
  };
  return b;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => Promise.resolve({ from }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/notifications/email", () => ({ getEmailAdapter: () => ({ send }) }));

const E = "22222222-2222-4222-8222-222222222222";
const C1 = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  requireAdmin.mockClear();
  send.mockClear();
  tables.cost_entries = [
    { id: C1, provider: "serper", kind: "variable", event_id: E, quantity: 2, cost_brl_cents: 40, occurred_at: "2026-10-10T10:00:00Z", deleted_at: "2026-10-20T00:00:00Z", deleted_by: "admin" },
    { id: C2, provider: "google_places", kind: "variable", event_id: E, quantity: 1, cost_brl_cents: 20, occurred_at: "2026-10-11T10:00:00Z", deleted_at: null },
  ];
  tables.llm_usage_events = [];
  tables.payments = [{ id: "p1", profile_id: "u", event_id: E, purpose: "event_ticket", amount_cents: 1000, asaas_fee_cents: 99, net_cents: 901, status: "paid", billing_type: "PIX", created_at: "2026-10-09T10:00:00Z", confirmed_at: null, refunded_at: null }];
  tables.events = [{ id: E, title: "Festa" }];
  tables.provider_balances = [{ provider: "vps", label: "VPS", runway_alert_days: 7, renewal_date: "2026-10-30", renewal_alerted_for: null }];
});

describe("lixeira", () => {
  it("restaurar devolve o custo e exige admin", async () => {
    const { restoreAction } = await import("@/app/admin/lixeira/actions");
    const f = new FormData();
    f.set("kind", "custos");
    f.append("id", C1);
    await restoreAction(f);
    expect(requireAdmin).toHaveBeenCalled();
    expect(tables.cost_entries[0]).toMatchObject({ deleted_at: null, deleted_by: null });
    expect(tables.cost_entries).toHaveLength(2);
  });
  it("tipo inválido não faz nada", async () => {
    const { restoreAction } = await import("@/app/admin/lixeira/actions");
    const f = new FormData();
    f.set("kind", "events");
    f.append("id", E);
    await restoreAction(f);
    expect(tables.cost_entries[0].deleted_at).not.toBeNull();
  });
});

describe("vencimento da VPS por e-mail", () => {
  it("envia uma vez e marca a data; não repete", async () => {
    const { sendRenewalNotices } = await import("@/lib/finance/balance-monitor");
    const now = new Date("2026-10-25T12:00:00Z");
    expect(await sendRenewalNotices(tables.provider_balances as never, now)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(String((send.mock.calls[0][0] as { subject: string }).subject)).toContain("vencimento");
    expect(tables.provider_balances[0].renewal_alerted_for).toBe("2026-10-30");
    expect(await sendRenewalNotices(tables.provider_balances as never, now)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("e-mail falhou → não marca (tenta de novo amanhã)", async () => {
    const { sendRenewalNotices } = await import("@/lib/finance/balance-monitor");
    send.mockRejectedValueOnce(new Error("x"));
    expect(await sendRenewalNotices(tables.provider_balances as never, new Date("2026-10-25T12:00:00Z"))).toBe(0);
    expect(tables.provider_balances[0].renewal_alerted_for).toBeNull();
  });
});

describe("CSV por evento", () => {
  it("custos (sem excluídos), receita e margem", async () => {
    const { GET } = await import("@/app/admin/eventos/[id]/csv/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: E }) });
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("custo;Google Places;1;0,20");
    expect(body).not.toContain("Serper");
    expect(body).toContain("receita;Asaas (valor pago);;10,00");
    expect(body).toContain("margem;;;8,81");
    expect(requireAdmin).toHaveBeenCalled();
  });
  it("id inválido → 400", async () => {
    const { GET } = await import("@/app/admin/eventos/[id]/csv/route");
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: "x" }) })).status).toBe(400);
  });
});
