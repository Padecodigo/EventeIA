import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0047_trash_suppliers_ticket_owner_edit.sql", "utf8").replace(/--.*$/gm, "");

describe("migração 0047", () => {
  it("é aditiva (não remove nada)", () => {
    expect(sql).not.toMatch(/\b(drop\s+(table|column|policy)|truncate|delete\s+from|alter\s+column)\b/i);
  });
  it("RPCs do dono checam auth.uid(), dono e status, e não estão abertas a anon", () => {
    expect(sql).toMatch(/user_id = v_uid and deleted_at is null\s+and status in \('aberto', 'em_andamento'\)/);
    expect(sql).toMatch(/revoke all on function public\.support_ticket_owner_edit\(uuid, text, text\) from public, anon/);
    expect(sql).toMatch(/as restrictive for select to authenticated\s+using \(deleted_at is null or public\.is_admin\(\)\)/);
  });
  it("fornecedores ganham deleted_at e há log de auditoria só para admin", () => {
    expect(sql).toMatch(/alter table public\.suppliers add column if not exists deleted_at/);
    expect(sql).toMatch(/create table if not exists public\.admin_audit_log/);
    expect(sql).toMatch(/admin_audit_log: admin lê/);
  });
});
