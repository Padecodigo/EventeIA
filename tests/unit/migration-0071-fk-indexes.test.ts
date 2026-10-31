import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0071_fk_indexes.sql"),
  "utf8",
);
const lower = sql.toLowerCase();

describe("migração 0071 (índices de chaves estrangeiras)", () => {
  it("indexa as FKs de supplier_selections", () => {
    expect(lower).toContain(
      "create index if not exists supplier_selections_supplier_idx\n  on public.supplier_selections (supplier_id)",
    );
    expect(lower).toContain(
      "create index if not exists supplier_selections_option_idx\n  on public.supplier_selections (option_id)",
    );
    expect(lower).toContain(
      "create index if not exists supplier_selections_chosen_by_idx\n  on public.supplier_selections (chosen_by_profile_id)",
    );
    expect(lower).toContain(
      "create index if not exists supplier_selections_conversation_idx\n  on public.supplier_selections (conversation_id)",
    );
  });

  it("indexa profile_id dos consentimentos e não repete quotation_id (coberto pela unique)", () => {
    expect(lower).toContain(
      "create index if not exists contact_handoff_consents_profile_idx\n  on public.contact_handoff_consents (profile_id)",
    );
    expect(lower).not.toContain("contact_handoff_consents (quotation_id)");
  });

  it("é aditiva e não destrutiva", () => {
    expect(lower).not.toMatch(/\b(drop table|drop column|drop index|truncate|delete from)\b/);
  });
});
