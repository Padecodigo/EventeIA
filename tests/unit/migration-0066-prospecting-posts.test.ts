import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0066_prospecting_posts.sql"),
  "utf8",
).toLowerCase();

describe("migração 0066 (post de prospecção por evento)", () => {
  it("cria a tabela prospecting_posts com vínculo ao evento e código único", () => {
    expect(lower).toContain("create table if not exists public.prospecting_posts");
    expect(lower).toContain("event_id uuid not null references public.events");
    expect(lower).toContain("event_code text not null unique");
  });

  it("guarda o conteúdo e o estado da publicação", () => {
    for (const column of ["caption", "image_url", "image_params", "status", "ig_media_id", "published_at"]) {
      expect(lower).toContain(column);
    }
  });

  it("tem RLS forçada e leitura apenas para admin", () => {
    expect(lower).toContain("alter table public.prospecting_posts enable row level security");
    expect(lower).toContain("alter table public.prospecting_posts force row level security");
    expect(lower).toContain("using (public.is_admin())");
    expect(lower).not.toContain("using (true)");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
