import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0056_supplier_status.sql"),
  "utf8",
).toLowerCase();

describe("migração 0056 (status do fornecedor)", () => {
  it("cria a coluna com default e o check dos estados", () => {
    expect(lower).toContain("add column if not exists status text not null default 'novo'");
    for (const status of ["novo", "marcado", "comentou", "respondeu", "cotou", "descartado", "opt-out"]) {
      expect(lower).toContain(`'${status}'`);
    }
  });

  it("faz backfill a partir dos sinais existentes", () => {
    expect(lower).toContain("update public.suppliers");
    expect(lower).toContain("prospect_quotes");
    expect(lower).toContain("vendor_prospects");
  });

  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate)\b/);
  });
});
