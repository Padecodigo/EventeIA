import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = readFileSync(join(process.cwd(), "supabase/migrations/0042_cost_entries_estimate_flag.sql"), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("0042 — custo estimado + exclusão recuperável", () => {
  it("é aditiva: sem DROP TABLE/COLUMN, DELETE ou TRUNCATE", () => {
    expect(code).not.toMatch(/drop\s+(table|column)/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).toMatch(/add column if not exists is_estimate boolean;/);
    expect(code).toMatch(/cost_entries add column if not exists deleted_at timestamptz/);
    expect(code).toMatch(/finance_alerts add column if not exists deleted_at timestamptz/);
  });
  it("grants só de colunas de exclusão; nada para anon", () => {
    expect(code).toMatch(/grant update \(deleted_at, deleted_by\) on public\.cost_entries to authenticated/);
    expect(code).toMatch(/grant update \(deleted_at, deleted_by\) on public\.finance_alerts to authenticated/);
    expect(code).not.toMatch(/to anon/);
    expect(code).not.toMatch(/grant (all|delete|insert)/i);
  });
  it("política de update em finance_alerts exige is_admin()", () => {
    expect(code).toMatch(/for update to authenticated\s+using \(\(select public\.is_admin\(\)\)\)\s+with check \(\(select public\.is_admin\(\)\)\)/);
  });
});
