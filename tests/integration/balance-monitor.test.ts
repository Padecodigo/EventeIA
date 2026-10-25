import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const sent: { to: string; subject: string }[] = [];

function from(table: string) {
  const filters: [string, unknown][] = [];
  let patch: Row | null = null;
  let inserted: Row[] | null = null;
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    gte: () => b,
    // exclusão recuperável: soma só custos não excluídos (deleted_at is null)
    is: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    update: (p: Row) => ((patch = p), b),
    insert: (rows: Row[]) => ((inserted = rows), b),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      if (inserted) (tables[table] ??= []).push(...inserted);
      const rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      if (patch) for (const r of rows) Object.assign(r, patch);
      return Promise.resolve({ data: rows, error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/notifications/email", () => ({ getEmailAdapter: () => ({ mode: "mock", send: async (m: { to: string; subject: string }) => (sent.push(m), { id: null }) }) }));
vi.mock("@/lib/finance/runtime", () => ({ currentFxMicro: async () => 5_000_000, currentPrices: async () => ({ "serper.per_1k": 1_000_000 }) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ ASAAS_ENVIRONMENT: "sandbox" }) }));

import { runBalanceCheck } from "@/lib/finance/balance-monitor";

describe("cheque diário de saldos", () => {
  beforeEach(() => {
    sent.length = 0;
    tables.finance_alerts = [];
    tables.llm_usage_events = [{ provider: "deepseek", cost_brl_cents: 7000 }];
    tables.cost_entries = [{ provider: "google_places", kind: "variable", cost_brl_cents: 9_000 }];
    tables.provider_balances = [
      { provider: "deepseek", label: "DeepSeek", source: "api", balance_brl_cents: null, threshold_brl_cents: 5000, runway_alert_days: 7, daily_burn_brl_cents: null, last_alert_at: null, monthly_budget_brl_cents: null },
      { provider: "serper", label: "Serper", source: "api", balance_brl_cents: null, threshold_brl_cents: 500, runway_alert_days: 7, daily_burn_brl_cents: null, last_alert_at: null, monthly_budget_brl_cents: null },
      { provider: "google_places", label: "Google Places", source: "budget", balance_brl_cents: null, threshold_brl_cents: 2000, runway_alert_days: 7, daily_burn_brl_cents: null, last_alert_at: null, monthly_budget_brl_cents: 10_000 },
    ];
    process.env.DEEPSEEK_API_KEY = "test";
    process.env.SERPER_API_KEY = "test";
  });

  it("busca saldos ao vivo, aplica orçamento e envia UM e-mail com os provedores baixos", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("deepseek") ? { balance_infos: [{ currency: "USD", total_balance: "2.00" }] } : { balance: 2500 }), { status: 200 }),
    );
    const r = await runBalanceCheck({ fetchImpl, now: new Date("2026-10-25T12:00:00Z") });
    const pb = tables.provider_balances;
    expect(pb[0]?.balance_brl_cents).toBe(1000); // US$2 × 5
    expect(pb[1]?.balance_brl_cents).toBe(1250);
    expect(pb[2]?.balance_brl_cents).toBe(1000); // 100 − 90
    expect(r.alerts).toBe(2); // deepseek (< R$50) e google_places (< R$20)
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("padecodigo@gmail.com");
    expect(tables.finance_alerts).toHaveLength(2);
    // Regressão: não reenvia no mesmo dia (cooldown).
    await runBalanceCheck({ fetchImpl, now: new Date("2026-10-25T13:00:00Z") });
    expect(sent).toHaveLength(1);
  });

  it("erro da API fica registrado sem derrubar o cheque", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 }));
    await runBalanceCheck({ fetchImpl, now: new Date("2026-10-25T12:00:00Z") });
    expect((tables.provider_balances)[0]?.last_error).toMatch(/HTTP 500/);
  });
});
