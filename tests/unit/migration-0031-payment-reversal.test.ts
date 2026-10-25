import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0031_payment_reversal.sql"), "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("0031 — estorno/chargeback", () => {
  it("é aditiva: não apaga dados", () => {
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).not.toMatch(/\bdrop\s+table\b/i);
  });

  it("trigger só na transição para refunded/chargeback, sem EXECUTE para clientes", () => {
    expect(code).toMatch(/after update of status on public\.payments/);
    expect(code).toMatch(/old\.status in \('refunded', 'chargeback'\)/);
    expect(code).toMatch(/revoke all on function public\.revoke_on_payment_reversal\(\) from public, anon, authenticated/);
    expect(code).toMatch(/set search_path = public/);
  });

  it("estorno de créditos limitado ao saldo e idempotente", () => {
    expect(code).toMatch(/least\(v_granted - v_already, v_balance\)/);
    expect(code).toMatch(/on conflict \(idempotency_key\) do nothing/);
  });

  it("process_payment_webhook não reaproveita FOUND após o bootstrap", () => {
    expect(code).toMatch(/if v_payment\.id is null then/);
    expect(code).toMatch(/grant execute on function public\.process_payment_webhook\(uuid\) to service_role/);
  });
});
