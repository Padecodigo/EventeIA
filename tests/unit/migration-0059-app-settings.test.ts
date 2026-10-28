import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(join(process.cwd(), "supabase/migrations/0059_app_settings.sql"), "utf8").toLowerCase();

describe("migração 0059 (app_settings)", () => {
  it("cria a tabela com RLS de admin", () => {
    expect(lower).toContain("create table if not exists public.app_settings");
    expect(lower).toContain("enable row level security");
    expect(lower).toContain("public.is_admin()");
  });
  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate)\b/);
  });
});
