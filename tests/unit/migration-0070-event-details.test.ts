import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0070_event_details.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0070 (dados do evento)", () => {
  it("adiciona capacidade, tipo do local e estilo de forma aditiva", () => {
    expect(lower).toContain("add column if not exists venue_capacity integer");
    expect(lower).toContain("add column if not exists venue_type text");
    expect(lower).toContain("add column if not exists event_style text");
  });

  it("capacidade é inteira positiva quando informada", () => {
    expect(lower).toContain("check (venue_capacity is null or venue_capacity > 0)");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
    expect(lower).not.toMatch(/\bupdate public\.events\b/);
  });
});
