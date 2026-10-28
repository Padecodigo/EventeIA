import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0058_art_cache_ttl.sql"),
  "utf8",
).toLowerCase();

describe("migração 0058 (arte com TTL)", () => {
  it("adiciona a validade e cria o bucket", () => {
    expect(lower).toContain("add column if not exists image_expires_at");
    expect(lower).toContain("insert into storage.buckets");
    expect(lower).toContain("'prospecting-art'");
  });

  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate)\b/);
  });
});
