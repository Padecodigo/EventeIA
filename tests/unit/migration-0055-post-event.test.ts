import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0055_prospect_posts_event.sql"),
  "utf8",
).toLowerCase();

describe("migração 0055 (post vinculado ao evento)", () => {
  it("adiciona event_id de forma aditiva", () => {
    expect(lower).toContain("add column if not exists event_id uuid references public.events");
  });

  it("cria índice e não é destrutiva", () => {
    expect(lower).toContain("prospect_posts_event_idx");
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
