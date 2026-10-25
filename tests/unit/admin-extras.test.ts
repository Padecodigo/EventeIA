import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { clearSchema, splitRefs } from "@/lib/finance/cost-delete";
import { placesMonth, recurringDue, renewalStatus } from "@/lib/finance/fixed-extras";
import { parseSituation } from "@/lib/support/admin-ops";

describe("vencimento da VPS", () => {
  const now = new Date("2026-10-25T15:00:00Z"); // 12h em Brasília
  it("conta dias restantes e alerta dentro do fôlego mínimo", () => {
    expect(renewalStatus("2026-11-24", now, 7)).toEqual({ daysLeft: 30, alert: false });
    expect(renewalStatus("2026-10-30", now, 7)).toEqual({ daysLeft: 5, alert: true });
    expect(renewalStatus("2026-10-20", now, 7)).toEqual({ daysLeft: -5, alert: true });
    expect(renewalStatus(null, now, 7)).toEqual({ daysLeft: null, alert: false });
  });
  it("usa a data de Brasília perto da meia-noite UTC", () => {
    expect(renewalStatus("2026-10-26", new Date("2026-10-26T02:00:00Z"), 1).daysLeft).toBe(1);
  });
});

describe("Google Places: estimativa do mês", () => {
  it("desconta a franquia, projeta e compara com o orçamento", () => {
    const pm = placesMonth({ calls: 1500, unitCents: 19, now: new Date("2026-10-15T15:00:00Z"), budgetCents: 10_000 });
    expect(pm.billableCalls).toBe(500);
    expect(pm.costCents).toBe(9500);
    expect(pm.projectedCalls).toBe(3100);
    expect(pm.projectedCents).toBe(2100 * 19);
    expect(pm.overBudget).toBe(true);
  });
  it("dentro da franquia = R$ 0", () => {
    const pm = placesMonth({ calls: 200, unitCents: 19, now: new Date("2026-10-25T15:00:00Z"), budgetCents: null });
    expect(pm.costCents).toBe(0);
    expect(pm.budgetUsedPct).toBeNull();
  });
});

describe("custos fixos recorrentes", () => {
  it("copia só o mais recente de cada custo recorrente sem lançamento no mês", () => {
    const due = recurringDue([
      { id: "1", provider: "vps", note: null, occurred_at: "2026-09-01T12:00:00Z", recurring: true },
      { id: "2", provider: "supabase", note: null, occurred_at: "2026-10-01T12:00:00Z", recurring: true },
      { id: "3", provider: "domain", note: null, occurred_at: "2026-09-01T12:00:00Z", recurring: false },
      { id: "4", provider: "other", note: "Canva · fatura 1", occurred_at: "2026-08-01T12:00:00Z", recurring: true },
      { id: "5", provider: "other", note: "Canva", occurred_at: "2026-09-01T12:00:00Z", recurring: true },
    ], "2026-10");
    expect(due.map((d) => d.id).sort()).toEqual(["1", "5"]);
  });
});

describe("exclusão de linhas de custo", () => {
  const U = "22222222-2222-4222-8222-222222222222";
  it("aceita só c:/l: + UUID", () => {
    expect(splitRefs([`c:${U}`, `l:${U}`])).toEqual({ cost: [U], llm: [U] });
    expect(splitRefs([`p:${U}`])).toBeNull();
    expect(splitRefs(["c:x"])).toBeNull();
    expect(splitRefs([])).toBeNull();
  });
  it("valida o período", () => {
    expect(clearSchema.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(clearSchema.safeParse({ from: "x", to: "2026-10-31" }).success).toBe(false);
  });
});

describe("filtro de chamados", () => {
  it("padrão = abertos", () => {
    expect(parseSituation(undefined)).toBe("abertos");
    expect(parseSituation("encerrados")).toBe("encerrados");
    expect(parseSituation("todos")).toBe("todos");
    expect(parseSituation("hack")).toBe("abertos");
  });
});

describe("migrações 0043–0045 são aditivas e seguras", () => {
  for (const f of ["0043_support_ticket_close_soft_delete.sql", "0044_fixed_recurring_vps_renewal.sql", "0045_llm_usage_soft_delete.sql"]) {
    const code = readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    it(f, () => {
      expect(code).not.toMatch(/drop\s+(table|column)/i);
      expect(code).not.toMatch(/\bdelete\s+from\b/i);
      expect(code).not.toMatch(/\btruncate\b/i);
      expect(code).not.toMatch(/to anon/i);
      expect(code).not.toMatch(/grant (all|delete|insert)/i);
      expect(code).not.toMatch(/create policy/i);
    });
  }
});
