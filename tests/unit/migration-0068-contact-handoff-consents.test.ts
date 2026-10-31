import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0068_contact_handoff_consents.sql"),
  "utf8",
).toLowerCase();

describe("migração 0068 (consentimento de repasse de contato)", () => {
  it("cria a tabela de consentimentos com texto, versão e instante do aceite", () => {
    expect(sql).toContain("create table if not exists public.contact_handoff_consents");
    expect(sql).toContain("consent_text text not null");
    expect(sql).toContain("consent_version text not null");
    expect(sql).toContain("accepted_at timestamptz not null");
    expect(sql).toContain("delivery_status");
    expect(sql).toContain("fallback_url");
  });

  it("não guarda IP e tem uma linha por cotação/pessoa", () => {
    expect(sql).not.toMatch(/\bip(_address)?\s+(text|inet|uuid)/);
    expect(sql).toContain("unique (quotation_id, profile_id)");
  });

  it("RLS default-deny somente nas próprias linhas", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("profile_id = auth.uid()");
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it("não permite que o usuário atualize a própria linha (status só via service_role)", () => {
    expect(sql).not.toMatch(/for\s+update\s+to\s+authenticated/);
    expect(sql).toContain("grant select, insert on public.contact_handoff_consents to authenticated");
    expect(sql).not.toMatch(
      /grant[^;]*\bupdate\b[^;]*on public\.contact_handoff_consents to authenticated/,
    );
    expect(sql).toContain(
      "revoke update, delete on public.contact_handoff_consents from authenticated",
    );
  });

  it("acrescenta o status repassado e o e-mail público sem remover dados", () => {
    expect(sql).toContain("'repassado'");
    expect(sql).toContain("add column if not exists repassado_at timestamptz");
    expect(sql).toContain("add column if not exists contact_email text");
    expect(sql).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
    expect(sql).toContain("revoke all on public.contact_handoff_consents from anon");
  });
});
