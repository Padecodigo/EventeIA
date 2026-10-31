import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSignupsDb } from "../unit/helpers/fake-signups-db";

const requireAdmin = vi.fn(() => Promise.resolve({ id: "admin", email: "admin@x" }));
const adminDb = fakeSignupsDb({ profiles: [], events: [] });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => adminDb.db }));

const { loadRecentSignups } = await import("@/lib/admin/signups");
const { default: AdminCadastrosPage } = await import("@/app/admin/cadastros/page");

beforeEach(() => requireAdmin.mockClear());

describe("/admin/cadastros (admin)", () => {
  it("não-admin é rejeitado pelo loader sem consultar o banco", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/painel"));
    const { db, queries } = fakeSignupsDb({ profiles: [{ id: "p1", display_name: "Ana", created_at: "2026-10-22T12:00:00Z" }] });

    await expect(loadRecentSignups(db)).rejects.toThrow("NEXT_REDIRECT:/painel");
    expect(queries).toEqual([]);
  });

  it("não-admin não consegue abrir a página", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/painel"));
    await expect(AdminCadastrosPage()).rejects.toThrow("NEXT_REDIRECT:/painel");
  });

  it("admin recebe a lista de cadastros", async () => {
    const rows = await loadRecentSignups(adminDb.db);
    expect(requireAdmin).toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});
