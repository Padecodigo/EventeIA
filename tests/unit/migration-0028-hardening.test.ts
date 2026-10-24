import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0028_function_hardening.sql"), "utf8").toLowerCase();

describe("migração 0028 (advisor de segurança)", () => {
  it("fixa search_path das funções de trigger", () => {
    expect(sql).toContain("alter function public.set_updated_at() set search_path = public");
    expect(sql).toContain("alter function public.credit_ledger_guard() set search_path = public");
  });
  it("helpers de RLS seguem executáveis por authenticated, nunca por anon", () => {
    for (const fn of ["is_admin()", "is_workspace_member(uuid)", "can_edit_workspace(uuid)"]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated, service_role;`);
    }
  });
  it("não concede nada a anon e não altera dados", () => {
    expect(sql).not.toMatch(/grant[^;]*\banon\b/);
    expect(sql).not.toMatch(/\b(delete|truncate|drop|update)\b/);
  });
});
