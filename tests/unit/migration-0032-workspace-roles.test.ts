import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = readFileSync(join(process.cwd(), "supabase/migrations/0032_workspace_member_roles.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("0032 — papéis de workspace", () => {
  it("cliente só concede planner/viewer", () => {
    expect(code).toMatch(/member_role in \('planner', 'viewer'\)/);
  });
  it("só o owner remove um owner", () => {
    expect(code).toMatch(/member_role <> 'owner' or public\.workspace_role\(workspace_id\) = 'owner'/);
  });
  it("helper definer com search_path fixo e sem EXECUTE para anon", () => {
    expect(code).toMatch(/security definer\s+set search_path = public/);
    expect(code).toMatch(/revoke all on function public\.workspace_role\(uuid\) from public, anon/);
  });
  it("não apaga dados", () => {
    expect(code).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
  });
});
