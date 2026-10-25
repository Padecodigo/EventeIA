import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0029_payment_state_guards.sql"), "utf8").toLowerCase();

describe("migração 0029 (cliente não ativa evento/tíquete nem grava pagamento pago)", () => {
  it("cria os três triggers BEFORE", () => {
    expect(sql).toContain("before insert or update on public.events");
    expect(sql).toContain("before insert or update on public.event_tickets");
    expect(sql).toContain("before insert on public.payments");
  });
  it("só restringe papéis do cliente; service_role/definer seguem livres", () => {
    expect(sql.match(/if current_user not in \('authenticated', 'anon'\) then\s+return new;/g)?.length).toBe(3);
    expect(sql).not.toContain("security definer");
  });
  it("cliente só move draft -> awaiting_payment e só cria tíquete/pagamento pendente", () => {
    expect(sql).toContain("old.status = 'draft' and new.status = 'awaiting_payment'");
    expect(sql).toContain("new.status <> 'pending' or new.activated_at is not null");
    expect(sql).toContain("pagamento só nasce pendente");
  });
  it("é aditiva: não apaga nem altera dados", () => {
    expect(sql).not.toMatch(/\b(delete from|truncate|drop table|drop column|update public\.)/);
    expect(sql).not.toMatch(/grant[^;]*\banon\b/);
  });
});
