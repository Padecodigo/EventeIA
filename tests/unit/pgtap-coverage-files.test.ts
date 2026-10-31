import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SQL_FILES = [
  "supabase/tests/rls_coverage_test.sql",
  "supabase/tests/prospect_rls_test.sql",
  "supabase/tests/supplier_conversations_rls_test.sql",
] as const;

describe("pgTAP de cobertura RLS", () => {
  it("os arquivos existem", () => {
    for (const f of SQL_FILES) {
      expect(existsSync(f), f).toBe(true);
    }
  });

  it("contêm plan() e finish()", () => {
    for (const f of SQL_FILES) {
      const sql = readFileSync(f, "utf8");
      expect(sql).toMatch(/plan\s*\(/);
      expect(sql).toMatch(/finish\s*\(/);
    }
  });
});
