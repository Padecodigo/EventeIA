import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0061_meta_token_health.sql"), "utf8");
const lower = sql.toLowerCase();

describe("migração 0061 (saúde do token Meta)", () => {
  it("cria meta_token_status com RLS forçada", () => {
    expect(lower).toContain("create table if not exists public.meta_token_status");
    expect(lower).toContain("alter table public.meta_token_status enable row level security");
    expect(lower).toContain("alter table public.meta_token_status force row level security");
  });

  it("restringe a leitura ao admin (is_admin)", () => {
    expect(lower).toContain("using (public.is_admin())");
  });

  it("estende finance_alerts.kind sem apagar valores antigos", () => {
    expect(lower).toContain("drop constraint if exists finance_alerts_kind_check");
    expect(lower).toContain("'low_balance'");
    expect(lower).toContain("'low_runway'");
    expect(lower).toContain("'fetch_error'");
    expect(lower).toContain("'meta_token'");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
