import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0088_disable_marketing_autopilot.sql"),
  "utf8",
).toLowerCase();

describe("migração 0088 (desativa o autopilot de publicidade)", () => {
  it("desliga e marca a flag como obsoleta", () => {
    expect(sql).toContain("marketing_autopilot");
    expect(sql).toContain("'enabled', false");
    expect(sql).toContain("'deprecated', true");
    expect(sql).toContain("on conflict (key) do update");
  });

  it("não remove tabelas nem dados compartilhados", () => {
    expect(sql).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
