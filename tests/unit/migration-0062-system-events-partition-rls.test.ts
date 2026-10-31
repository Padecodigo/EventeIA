import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0062_system_events_partition_rls.sql"),
  "utf8",
).toLowerCase();

describe("migração 0062 (RLS na partição de system_events)", () => {
  it("habilita e força RLS em system_events_default", () => {
    expect(sql).toContain("alter table public.system_events_default enable row level security");
    expect(sql).toContain("alter table public.system_events_default force row level security");
  });

  it("é aditiva (não apaga nada)", () => {
    for (const bad of ["drop table", "drop column", "truncate", "delete from"]) {
      expect(sql).not.toContain(bad);
    }
  });
});
