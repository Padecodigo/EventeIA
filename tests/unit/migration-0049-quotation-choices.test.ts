import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0049_quotation_choices.sql"),
  "utf8",
).toLowerCase();

describe("migração 0049 (escolhas do fornecedor)", () => {
  it("cria a tabela com snapshot e uma escolha por cotação", () => {
    expect(sql).toContain("create table public.quotation_choices");
    expect(sql).toContain("quotation_id uuid not null unique");
    expect(sql).toContain("option_snapshot jsonb not null");
    expect(sql).toContain("option_index integer not null check");
    expect(sql).toContain("references public.events(id)");
    expect(sql).toContain("references public.quotations(id)");
  });

  it("RLS default-deny com posse/workspace", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("owner_profile_id = auth.uid()");
    expect(sql).toContain("is_workspace_member");
    expect(sql).toContain("can_edit_workspace");
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it("é aditiva e não expõe ao anon", () => {
    expect(sql).not.toMatch(/\b(drop table|truncate|delete from)\b/);
    expect(sql).toContain("revoke all on public.quotation_choices from anon");
  });
});
