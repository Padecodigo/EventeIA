import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ADMIN_NAV, isAdminRole } from "@/lib/admin/nav";

describe("menu admin (superusuário)", () => {
  it("lista todas as páginas administrativas", () => {
    expect(ADMIN_NAV.map((i) => i.href)).toEqual([
      "/admin/financeiro",
      "/admin/custos",
      "/admin/consumo",
      "/admin/depoimentos",
      "/admin/cupons",
      "/admin/chamados",
      "/admin/eventos",
      "/admin/clientes",
      "/admin/fornecedores",
      "/admin/lixeira",
      "/admin/busca",
    ]);
  });
  it("só 'admin' é superusuário", () => {
    expect(isAdminRole("admin")).toBe(true);
    for (const r of ["user", "planner", "owner", "", null, undefined, "Admin"])
      expect(isAdminRole(r)).toBe(false);
  });
  it("migração 0035 só adiciona SELECT restrito a is_admin()", () => {
    const sql = readFileSync("supabase/migrations/0035_admin_superuser_read.sql", "utf8");
    expect(sql).toMatch(/for select to authenticated using \(public\.is_admin\(\)\)/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
    expect(sql).not.toMatch(/using \(true\)/i);
  });
});
