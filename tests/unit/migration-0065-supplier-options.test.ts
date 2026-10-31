import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0065_supplier_options.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0065 (opções de fornecedor e seleção de produtos)", () => {
  it("cria supplier_options e supplier_selections com RLS forçada", () => {
    for (const table of ["supplier_options", "supplier_selections"]) {
      expect(lower).toContain(`create table if not exists public.${table}`);
      expect(lower).toContain(`alter table public.${table} enable row level security`);
      expect(lower).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("modela opções com preço em centavos e unidade", () => {
    expect(lower).toContain("price_cents");
    expect(lower).toContain("'por_pessoa'");
    expect(lower).toContain("source_message_id");
  });

  it("modela a máquina de estados da seleção", () => {
    for (const status of [
      "pendente",
      "enviado_ao_fornecedor",
      "aguardando_resposta",
      "respondido",
      "canal_fechado",
      "indisponivel",
    ]) {
      expect(lower).toContain(`'${status}'`);
    }
  });

  it("garante uma seleção por fornecedor por evento", () => {
    expect(lower).toContain("unique (event_id, supplier_id)");
  });

  it("leitura: admin e dono do evento (via join)", () => {
    expect(lower).toContain("using (public.is_admin())");
    expect(lower).toContain("e.owner_profile_id = auth.uid()");
  });

  it("nunca pré-seleciona: sem default de opção (apenas status pendente)", () => {
    expect(lower).toContain("status text not null default 'pendente'");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
