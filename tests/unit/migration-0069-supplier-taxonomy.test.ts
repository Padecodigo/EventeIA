import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0069_supplier_taxonomy.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0069 (taxonomia de fornecedor)", () => {
  it("adiciona inclui, capacidade e tipo_espaco de forma aditiva", () => {
    expect(lower).toContain("add column if not exists inclui text[] not null default '{}'::text[]");
    expect(lower).toContain("add column if not exists capacidade integer");
    expect(lower).toContain("add column if not exists tipo_espaco text");
  });

  it("capacidade é inteira positiva quando informada", () => {
    expect(lower).toContain("check (capacidade is null or capacidade > 0)");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
    expect(lower).not.toMatch(/\bupdate public\.suppliers\b/);
  });
});
