import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const lower = readFileSync(join(process.cwd(), "supabase/migrations/0081_prospect_window_reminder.sql"), "utf8").toLowerCase();

describe("migração 0081 (lembrete janela 24h)", () => {
  it("é aditiva e idempotente", () => {
    expect(lower).toContain("add column if not exists reminder_sent_for_window text");
    expect(lower).toContain("add column if not exists reminder_sent_at timestamptz");
    expect(lower).not.toMatch(/\bdrop\b|\bdelete\b|create policy|disable row level/);
  });
});
