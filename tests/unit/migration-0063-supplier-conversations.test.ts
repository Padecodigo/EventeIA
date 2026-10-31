import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0063_supplier_conversations.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0063 (conversas de fornecedor nos canais Meta)", () => {
  it("cria as duas tabelas com RLS forçada", () => {
    for (const table of ["supplier_conversations", "supplier_conversation_messages"]) {
      expect(lower).toContain(`create table if not exists public.${table}`);
      expect(lower).toContain(`alter table public.${table} enable row level security`);
      expect(lower).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("modela janela e status da conversa", () => {
    expect(lower).toContain("window_expires_at");
    expect(lower).toContain("window_kind");
    expect(lower).toContain("'standard_24h'");
    expect(lower).toContain("'ad_7d'");
    expect(lower).toContain("'canal_fechado'");
    expect(lower).toContain("'opted_out'");
  });

  it("leitura: admin e dono do evento (via join)", () => {
    expect(lower).toContain("using (public.is_admin())");
    expect(lower).toContain("e.owner_profile_id = auth.uid()");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });

  it("tem idempotência por evento externo nas mensagens", () => {
    expect(lower).toContain("supplier_conversation_messages_external_uniq");
  });
});
