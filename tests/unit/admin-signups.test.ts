import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSignupsDb } from "./helpers/fake-signups-db";

const requireAdmin = vi.fn(() => Promise.resolve({ id: "admin", email: "admin@x" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin }));

const { formatSignupDate, instagramLabel, loadRecentSignups } = await import("@/lib/admin/signups");

const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";

const tables = {
  profiles: [
    { id: ANA, display_name: "Ana Souza", email: "ana@example.com", phone_e164: "+5511999999999", instagram_handle: "anasouza", created_at: "2026-10-22T12:00:00Z" },
    { id: BIA, display_name: "", created_at: "2026-10-20T12:00:00Z" },
  ],
  events: [
    { id: "e-antigo", owner_profile_id: ANA, title: "Casamento Ana", created_at: "2026-10-21T12:00:00Z" },
    { id: "e-novo", owner_profile_id: ANA, title: "Aniversário Ana", created_at: "2026-10-25T12:00:00Z" },
    { id: "e-bia", owner_profile_id: BIA, title: "", created_at: "2026-10-23T12:00:00Z" },
    { id: "e-outro", owner_profile_id: "outro", title: "Ignorado", created_at: "2026-10-26T12:00:00Z" },
  ],
};

beforeEach(() => requireAdmin.mockClear());

describe("cadastros recentes", () => {
  it("formata a data do cadastro em pt-BR no fuso de Brasília", () => {
    expect(formatSignupDate("2026-10-22T12:34:00Z")).toContain("22/10/2026");
    expect(formatSignupDate("2026-10-22T12:34:00Z")).toContain("09:34");
    expect(formatSignupDate(null)).toBe("—");
    expect(formatSignupDate("invalida")).toBe("—");
  });

  it("Instagram mostra o handle ou — quando ausente (campo opcional)", () => {
    expect(instagramLabel("@Allan")).toBe("@Allan");
    expect(instagramLabel("allan")).toBe("@allan");
    expect(instagramLabel(null)).toBe("—");
    expect(instagramLabel(undefined)).toBe("—");
    expect(instagramLabel("  ")).toBe("—");
  });

  it("lista os 100 mais novos com o evento mais recente de cada perfil", async () => {
    const { db, queries } = fakeSignupsDb(tables);
    const rows = await loadRecentSignups(db);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([
      {
        id: ANA,
        displayName: "Ana Souza",
        createdAt: "2026-10-22T12:00:00Z",
        instagramHandle: "anasouza",
        latestEvent: { id: "e-novo", title: "Aniversário Ana" },
      },
      {
        id: BIA,
        displayName: "(sem nome)",
        createdAt: "2026-10-20T12:00:00Z",
        instagramHandle: null,
        latestEvent: { id: "e-bia", title: "Sem título" },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("ana@example.com");
    expect(JSON.stringify(rows)).not.toContain("+5511999999999");

    expect(queries).toContainEqual({ table: "profiles", op: "limit", args: [100] });
    expect(queries).toContainEqual({ table: "profiles", op: "order", args: ["created_at", { ascending: false }] });
  });

  it("regressão: nunca seleciona e-mail ou telefone; lê instagram_handle", () => {
    const { db, queries } = fakeSignupsDb(tables);
    return loadRecentSignups(db).then(() => {
      const columns = queries.filter((q) => q.op === "select").map((q) => String(q.args[0]));
      expect(columns).toEqual(["id,display_name,instagram_handle,created_at", "id,owner_profile_id,title,created_at"]);
      for (const selected of columns) expect(selected).not.toMatch(/email|phone|whatsapp/i);
    });
  });

  it("mapeia instagram_handle do perfil para a coluna Instagram", async () => {
    const { db } = fakeSignupsDb(tables);
    const rows = await loadRecentSignups(db);
    const ana = rows.find((row) => row.displayName === "Ana Souza");
    expect(ana?.instagramHandle).toBe("anasouza");
    expect(instagramLabel(ana?.instagramHandle)).toBe("@anasouza");
  });

  it("perfil sem nenhum evento continua listado", async () => {
    const { db } = fakeSignupsDb({ profiles: [tables.profiles[1]], events: [] });
    const rows = await loadRecentSignups(db);
    expect(rows[0]?.latestEvent).toBeNull();
  });
});
