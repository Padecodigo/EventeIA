import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0054_prospect_nullable_supplier.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0054 (conversa sem fornecedor vinculado)", () => {
  it("relaxa o NOT NULL das duas colunas", () => {
    expect(lower).toContain("alter table public.prospect_conversations alter column supplier_id drop not null");
    expect(lower).toContain("alter table public.prospect_quotes alter column supplier_id drop not null");
  });

  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
