import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { eventCostCsv, emptyEventCost } from "@/lib/admin/event-csv";
import { cleanQuery, isUuid, searchAdmin, type SearchDb } from "@/lib/admin/search";
import { cleanIds, parseTrashKind, restoreItems, type TrashDb } from "@/lib/admin/trash";
import { renewalEmailText, renewalNotice } from "@/lib/finance/vps-renewal";

const U = "11111111-1111-4111-8111-111111111111";

describe("lixeira", () => {
  it("valida tipo e ids", () => {
    expect(parseTrashKind("custos")).toBe("custos");
    expect(parseTrashKind("events")).toBeNull();
    expect(parseTrashKind("toString")).toBeNull();
    expect(cleanIds([U, U, "x; drop", 3])).toEqual([U]);
  });
  it("restaura só itens na lixeira (deleted_at not null) e zera deleted_by", async () => {
    const calls: unknown[] = [];
    const q = { in: (...a: unknown[]) => (calls.push(["in", ...a]), q), not: (...a: unknown[]) => (calls.push(["not", ...a]), Promise.resolve({ error: null })) };
    const db = { from: (t: string) => (calls.push(["from", t]), { update: (p: unknown) => (calls.push(["update", p]), q) }) } as unknown as TrashDb;
    expect(await restoreItems(db, "chamados", [U])).toBe(1);
    expect(calls).toEqual([["from", "support_tickets"], ["update", { deleted_at: null, deleted_by: null }], ["in", "id", [U]], ["not", "deleted_at", "is", null]]);
    expect(await restoreItems(db, "custos", ["bad"])).toBe(0);
  });
  it("não existe restaurar/editar/excluir de eventos, pagamentos ou clientes", () => {
    const src = readFileSync("lib/admin/trash.ts", "utf8");
    expect(src).not.toMatch(/"(events|payments|profiles)"/);
  });
});

describe("busca geral", () => {
  it("limpa curingas e sintaxe", () => {
    expect(cleanQuery("  a ")).toBeNull();
    expect(cleanQuery("ana%,(or)")).toBe("ana or");
    expect(cleanQuery(5)).toBeNull();
    expect(isUuid(U)).toBe(true);
  });
  it("procura nas 4 áreas e junta nome/e-mail sem duplicar", async () => {
    const seen: string[] = [];
    const data: Record<string, Record<string, unknown>[]> = {
      profiles: [{ id: "p1", display_name: "Ana", email: "ana@x", role: "b2c" }],
      events: [{ id: "e1", title: "Casamento Ana", event_date: "2026-12-01", status: "active", city: "SP" }],
      support_tickets: [{ id: "t1", subject: "Ana ajuda", status: "aberto", created_at: "2026-10-01T00:00:00Z" }],
      suppliers: [{ id: "s1", name: "Buffet Ana", category: "buffet", city: null }],
    };
    const db = { from: (t: string) => ({ select: () => { const q = { ilike: (c: string, v: string) => (seen.push(`${t}.${c}=${v}`), q), eq: () => q, is: (c: string) => (seen.push(`${t}.${c}`), q), limit: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: data[t] }).then(r) }; return q; } }) } as unknown as SearchDb;
    const hits = await searchAdmin(db, "ana");
    expect(hits.map((h) => h.href)).toEqual(["/admin/clientes/p1", "/admin/eventos/e1", "/admin/chamados/t1", "/admin/fornecedores/s1"]);
    expect(seen).toContain("profiles.email=%ana%");
    expect(seen).toContain("support_tickets.deleted_at");
    expect(await searchAdmin(db, "a")).toEqual([]);
  });
});

describe("aviso de vencimento da VPS", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const row = { provider: "vps", label: "VPS", runway_alert_days: 7, renewal_date: "2026-10-30" };
  it("avisa dentro do limite e só uma vez por data", () => {
    expect(renewalNotice(row, now)).toEqual({ send: true, daysLeft: 5 });
    expect(renewalNotice({ ...row, renewal_alerted_for: "2026-10-30" }, now).send).toBe(false);
    expect(renewalNotice({ ...row, renewal_alerted_for: "2026-09-30" }, now).send).toBe(true);
    expect(renewalNotice({ ...row, renewal_date: "2026-12-30" }, now).send).toBe(false);
    expect(renewalNotice({ ...row, renewal_date: null }, now).send).toBe(false);
  });
  it("texto do e-mail", () => {
    const t = renewalEmailText([{ label: "VPS", renewalDate: "2026-10-30", daysLeft: 5 }], now);
    expect(t).toContain("30/10/2026");
    expect(t).toContain("faltam 5 dia(s)");
  });
  it("migração 0046 é aditiva", () => {
    const sql = readFileSync("supabase/migrations/0046_vps_renewal_alert_marker.sql", "utf8");
    expect(sql).toMatch(/add column if not exists renewal_alerted_for date/);
    expect(sql).not.toMatch(/drop|delete|policy/i);
  });
});

describe("CSV por evento", () => {
  it("custos por ferramenta, receita e margem", () => {
    const csv = eventCostCsv({ ...emptyEventCost(U, "X"), costCents: 150, revenueCents: 1000, marginCents: 850, marginBps: 8500, calls: 3,
      tools: [{ provider: "serper", calls: 3, cents: 150, estimatedCents: 150, basis: "estimado" }], estimatedCents: 150 }, { serper: "Serper" });
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0]).toBe("tipo;ferramenta;chamadas;valor_brl;base");
    expect(lines[1]).toBe("custo;Serper;3;1,50;estimado");
    expect(lines).toContain("receita;Asaas (valor pago);;10,00;");
    expect(lines).toContain("margem;;;8,50;85,0%");
  });
});
vi.restoreAllMocks();
