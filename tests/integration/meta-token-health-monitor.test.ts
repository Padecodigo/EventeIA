import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const sent: { to: string; subject: string; text: string }[] = [];

const env = vi.hoisted(() => ({ META_ACCESS_TOKEN: "tok" as string | undefined, META_API_VERSION: "v26.0" }));

vi.mock("@/lib/env", () => ({ serverEnv: () => env }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/notifications/email", () => ({
  getEmailAdapter: () => ({ mode: "mock", send: async (m: { to: string; subject: string; text: string }) => (sent.push(m), { id: null }) }),
}));

function from(table: string) {
  const filters: [string, unknown][] = [];
  let inserted: Row[] | null = null;
  let sort: { col: string; dir: "asc" | "desc" } | null = null;
  let limitN: number | null = null;
  const b = {
    select: () => b,
    order: (col: string, opts?: { ascending?: boolean }) => ((sort = { col, dir: opts?.ascending === false ? "desc" : "asc" }), b),
    limit: (n: number) => ((limitN = n), b),
    is: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    insert: (rows: Row | Row[]) => ((inserted = Array.isArray(rows) ? rows : [rows]), b),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      if (inserted) {
        for (const r of inserted) if (r.created_at === undefined) r.created_at = new Date().toISOString();
        (tables[table] ??= []).push(...inserted);
      }
      let rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      if (sort) {
        rows = [...rows].sort((a, b) => {
          const cmp = String(a[sort!.col] ?? "").localeCompare(String(b[sort!.col] ?? ""));
          return sort!.dir === "desc" ? -cmp : cmp;
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return Promise.resolve({ data: rows, error: null }).then(res);
    },
  };
  return b;
}

import { runMetaTokenHealthCheck } from "@/lib/meta/token-health-monitor";
import { OPTIONAL_META_SCOPES, REQUIRED_META_SCOPES } from "@/lib/meta/token-health";

const ALL_SCOPES = [...REQUIRED_META_SCOPES, ...OPTIONAL_META_SCOPES];

function okFetch() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ data: { is_valid: true, expires_at: 0, scopes: ALL_SCOPES } }), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("cheque diário de saúde do token Meta", () => {
  beforeEach(() => {
    sent.length = 0;
    tables.meta_token_status = [];
    tables.finance_alerts = [];
    env.META_ACCESS_TOKEN = "tok";
    delete process.env.FINANCE_ALERT_EMAIL;
  });

  it("token válido: grava status ok e não envia e-mail", async () => {
    const r = await runMetaTokenHealthCheck({ fetchImpl: okFetch(), now: new Date("2026-10-25T12:00:00Z") });
    expect(r.status).toBe("ok");
    expect(r.emailed).toBe(false);
    expect(sent).toHaveLength(0);
    expect(tables.finance_alerts).toHaveLength(0);
    expect(tables.meta_token_status).toHaveLength(1);
    expect(tables.meta_token_status[0]?.is_valid).toBe(true);
  });

  it("token inválido: gera alerta + e-mail", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { is_valid: false, expires_at: 0, scopes: ALL_SCOPES } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await runMetaTokenHealthCheck({ fetchImpl, now: new Date("2026-10-25T12:00:00Z") });
    expect(r.status).toBe("invalid");
    expect(r.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("padecodigo@gmail.com");
    expect(sent[0]?.subject).toContain("token da Meta");
    expect(tables.finance_alerts).toHaveLength(1);
    expect(tables.finance_alerts[0]?.kind).toBe("meta_token");
    expect(tables.finance_alerts[0]?.provider).toBe("meta");
  });

  it("escopos obrigatórios faltando: alerta + e-mail com os escopos", async () => {
    const granted = ["instagram_basic", "instagram_content_publish"];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { is_valid: true, expires_at: 0, scopes: granted } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await runMetaTokenHealthCheck({ fetchImpl, now: new Date("2026-10-25T12:00:00Z") });
    expect(r.status).toBe("missing_scopes");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("instagram_manage_messages");
    const row = tables.meta_token_status[0];
    expect(row?.missing_scopes).toEqual(REQUIRED_META_SCOPES.filter((s) => !granted.includes(s)));
    expect(row?.optional_missing).toEqual([...OPTIONAL_META_SCOPES]);
  });

  it("dedupe: não reenvia e-mail para o mesmo problema dentro de 24h", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { is_valid: false, expires_at: 0, scopes: ALL_SCOPES } }), { status: 200 }),
    ) as unknown as typeof fetch;
    await runMetaTokenHealthCheck({ fetchImpl, now: new Date() });
    expect(sent).toHaveLength(1);
    await runMetaTokenHealthCheck({ fetchImpl, now: new Date() });
    expect(sent).toHaveLength(1);
    expect(tables.finance_alerts).toHaveLength(1);
  });

  it("META_ACCESS_TOKEN ausente: status not_configured, sem e-mail", async () => {
    env.META_ACCESS_TOKEN = undefined;
    const r = await runMetaTokenHealthCheck({ now: new Date("2026-10-25T12:00:00Z") });
    expect(r.status).toBe("not_configured");
    expect(r.emailed).toBe(false);
    expect(sent).toHaveLength(0);
    expect(tables.meta_token_status[0]?.is_valid).toBe(false);
    expect(tables.meta_token_status[0]?.error).toContain("não configurado");
  });
});
