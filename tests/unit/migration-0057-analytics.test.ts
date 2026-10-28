import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0057_analytics_events.sql"),
  "utf8",
).toLowerCase();

describe("migração 0057 (analytics)", () => {
  it("cria a tabela com os eventos e RLS admin", () => {
    expect(lower).toContain("create table if not exists public.analytics_events");
    for (const e of ["page_view", "login", "signup"]) expect(lower).toContain(`'${e}'`);
    expect(lower).toContain("enable row level security");
    expect(lower).toContain("using (public.is_admin())");
  });

  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
