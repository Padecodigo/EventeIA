import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { QUEUE_NAMES } from "@/lib/queue";

const read = (p: string) => readFileSync(p, "utf8");

describe("regressão: créditos nunca expiram", () => {
  it("copy do painel e páginas públicas não promete expiração", () => {
    for (const file of [
      "app/(dashboard)/creditos/page.tsx",
      "app/(marketing)/planos/page.tsx",
      "app/(marketing)/para-planners/page.tsx",
    ]) {
      const src = read(file);
      expect(src).not.toMatch(/valem por (dois )?ciclos?/);
      expect(src).not.toMatch(/Uma fatura Pix por mês/);
      expect(src).toMatch(/não expiram/);
    }
  });

  it("worker não agenda mais o job de expiração", () => {
    const src = read("workers/index.ts");
    expect(src).not.toMatch(/runCreditsExpireSweep/);
    expect(QUEUE_NAMES).not.toHaveProperty("creditsExpire");
  });

  it("migração 0034 força expires_at nulo e recusa 'expire'", () => {
    const sql = read("supabase/migrations/0034_credits_never_expire.sql");
    expect(sql).toMatch(/new\.expires_at := null/);
    expect(sql).toMatch(/entry_type = 'expire'/);
    expect(sql).not.toMatch(/\bdelete\b/i);
  });
});
