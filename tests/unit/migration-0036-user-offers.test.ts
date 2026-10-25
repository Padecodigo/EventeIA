import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = readFileSync(join(process.cwd(), "supabase/migrations/0036_user_offers.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("0036 — ofertas pessoais", () => {
  it("prazo de 48h definido pelo banco e validado com now() no resgate", () => {
    expect(code.match(/now\(\) \+ interval '48 hours'/g)?.length).toBe(2);
    expect(code).toMatch(/claimed_at is null and expires_at > now\(\)/);
  });
  it("boas-vindas única por conta e nunca reiniciada (on conflict do nothing)", () => {
    expect(code).toMatch(
      /unique index if not exists user_offers_one_welcome\s+on public\.user_offers \(profile_id\) where kind = 'welcome'/,
    );
    expect(code).toMatch(/on conflict \(profile_id\) where kind = 'welcome' do nothing/);
  });
  it("valores: R$ 40 / 30% (boas-vindas) e R$ 20 / 20% (pessoal)", () => {
    expect(code).toMatch(/4000, 30, now\(\)/);
    expect(code).toMatch(/2000, 20, now\(\)/);
  });
  it("intervalo do 'Quer cupom?' parametrizado e serializado por usuário", () => {
    expect(code).toMatch(/make_interval\(days => p_cooldown_days\)/);
    expect(code).toMatch(/from public\.profiles where id = p_profile_id for update/);
  });
  it("RLS forçada, sem EXECUTE para anon/authenticated", () => {
    expect(code).toMatch(/force row level security/);
    expect(code).toMatch(
      /revoke all on function public\.user_offer_claim\(uuid, uuid\) from public, anon, authenticated/,
    );
    expect(code).not.toMatch(/grant execute on function [^;]+ to (anon|authenticated)/);
  });
  it("aditiva: não apaga dados", () => {
    expect(code).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
  });
});
