import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0051_events_client_lifecycle.sql"),
  "utf8",
).toLowerCase();

describe("migração 0051 (ciclo de vida do evento pelo cliente)", () => {
  it("substitui a guarda sem recriar o trigger", () => {
    expect(sql).toContain("create or replace function public.guard_events_client_write()");
    // O trigger de 0029 continua apontando para a função; recriá-lo aqui
    // duplicaria a definição sem necessidade.
    expect(sql).not.toContain("create trigger");
  });

  it("permite encerrar (active -> completed) e excluir (-> canceled)", () => {
    expect(sql).toContain("(old.status = 'active' and new.status = 'completed')");
    expect(sql).toContain("(old.status <> 'canceled' and new.status = 'canceled')");
    expect(sql).toContain("(old.status = 'draft' and new.status = 'awaiting_payment')");
  });

  it("mantém fechada a ativação pelo cliente (nada leva a active)", () => {
    expect(sql).not.toMatch(/new\.status\s*=\s*'active'/);
    // 'active' só aparece como origem de transição, nunca como destino.
    expect(sql).toContain("old.status = 'active'");
  });

  it("é aditiva e não mexe em dados", () => {
    expect(sql).not.toMatch(/\b(drop table|drop column|truncate|delete from|alter table)\b/);
  });
});
