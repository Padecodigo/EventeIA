import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0052_webhook_events_meta_source.sql"),
  "utf8",
).toLowerCase();

describe("migração 0052 (fonte meta no webhook_events)", () => {
  it("adiciona 'meta' ao CHECK de source sem apagar dados", () => {
    expect(sql).toContain("'meta'");
    expect(sql).toContain("add constraint webhook_events_source_check");
    expect(sql).not.toMatch(/\b(drop table|truncate|delete from)\b/);
  });
});
