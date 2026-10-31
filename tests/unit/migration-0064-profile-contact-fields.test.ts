import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(
  join(process.cwd(), "supabase/migrations/0064_profile_contact_fields.sql"),
  "utf8",
).toLowerCase();

describe("migração 0064 (campos de contato do perfil)", () => {
  it("adiciona as colunas de forma aditiva", () => {
    expect(lower).toContain("add column if not exists contact_whatsapp_e164 text");
    expect(lower).toContain("add column if not exists instagram_handle text");
  });

  it("concede UPDATE das colunas ao authenticated", () => {
    expect(lower).toContain(
      "grant update (contact_whatsapp_e164, instagram_handle) on public.profiles to authenticated",
    );
  });

  it("não é destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/);
  });
});
