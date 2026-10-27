import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0053_prospecting_flow.sql"), "utf8");
const lower = sql.toLowerCase();

describe("migração 0053 (fluxo de prospecção)", () => {
  it("cria as quatro tabelas com RLS forçada", () => {
    for (const table of ["prospect_posts", "prospect_conversations", "prospect_messages", "prospect_quotes"]) {
      expect(lower).toContain(`create table if not exists public.${table}`);
      expect(lower).toContain(`alter table public.${table} enable row level security`);
      expect(lower).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("restige a leitura ao admin (is_admin)", () => {
    expect(lower).toContain("using (public.is_admin())");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });

  it("guarda dinheiro em centavos inteiros (bigint)", () => {
    expect(lower).toContain("price_cents bigint");
    expect(lower).toContain("shipping_cents bigint");
  });

  it("tem idempotência por evento externo nas mensagens", () => {
    expect(lower).toContain("prospect_messages_external_uniq");
  });
});
