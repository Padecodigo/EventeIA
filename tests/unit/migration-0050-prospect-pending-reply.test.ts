import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0050_prospect_pending_reply.sql"),
  "utf8",
).toLowerCase();

describe("migração 0050 (resposta pendente de aprovação)", () => {
  it("adiciona as colunas de resposta pendente", () => {
    expect(sql).toContain("add column if not exists pending_reply text");
    expect(sql).toContain("add column if not exists pending_reply_kind text");
    expect(sql).toContain("add column if not exists pending_reply_at timestamptz");
  });

  it("restringe os tipos conhecidos e é aditiva", () => {
    expect(sql).toContain("pending_reply_kind in ('question', 'values', 'unavailable', 'other')");
    expect(sql).not.toMatch(/\b(drop column|drop table|truncate|delete from)\b/);
  });
});
