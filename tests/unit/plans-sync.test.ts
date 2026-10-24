import { readFileSync } from "node:fs";

import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/plans";

interface PlanRow {
  priceCents: number;
  credits: number;
}

function parsePlansFromSql(sql: string): Record<string, PlanRow> {
  const map: Record<string, PlanRow> = {};
  const pattern = /\('([a-z-]+)',\s*'[^']+',\s*(\d+),\s*(\d+),\s*true\)/g;

  for (const match of sql.matchAll(pattern)) {
    const code = match[1];
    const priceCents = match[2];
    const credits = match[3];

    if (code === undefined || priceCents === undefined || credits === undefined) {
      continue;
    }

    map[code] = { priceCents: Number(priceCents), credits: Number(credits) };
  }

  return map;
}

/**
 * Guarda de sincronização: o catálogo exibido no site (lib/plans.ts) precisa
 * bater com o banco (migração de preços e seed local). Se um mudar sem o
 * outro, este teste falha o CI.
 */
describe("catálogo de planos sincronizado com o banco", () => {
  it("lib/plans.ts bate com a migração 0006_plan_pricing_v2.sql", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/0006_plan_pricing_v2.sql"),
      "utf-8",
    );
    const fromSql = parsePlansFromSql(sql);

    for (const plan of PLANS) {
      const row = fromSql[plan.code];
      expect(row, `plano ${plan.code} ausente na migração`).toBeDefined();
      expect(row?.priceCents).toBe(plan.priceCents);
      expect(row?.credits).toBe(plan.credits);
    }
  });

  it("lib/plans.ts bate com o seed local (supabase/seed.sql)", () => {
    const sql = readFileSync(resolve("supabase/seed.sql"), "utf-8");
    const fromSeed = parsePlansFromSql(sql);

    for (const plan of PLANS) {
      const row = fromSeed[plan.code];
      expect(row, `plano ${plan.code} ausente no seed`).toBeDefined();
      expect(row?.priceCents).toBe(plan.priceCents);
      expect(row?.credits).toBe(plan.credits);
    }
  });

  it("migração e seed são idênticos entre si", () => {
    const migration = parsePlansFromSql(
      readFileSync(resolve("supabase/migrations/0006_plan_pricing_v2.sql"), "utf-8"),
    );
    const seed = parsePlansFromSql(readFileSync(resolve("supabase/seed.sql"), "utf-8"));
    expect(seed).toEqual(migration);
  });
});
