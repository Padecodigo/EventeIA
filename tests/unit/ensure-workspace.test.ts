import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

let existing: Row | null = null;
let profile: Row | null = null;
let lookupError: { code: string } | null = null;
let insertError: { code: string } | null = null;
const insertedWorkspaces: Row[] = [];
const upsertedMembers: Row[] = [];

function from(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: Record<string, any> = {};
  let insertRow: Row | null = null;

  q.select = () => q;
  q.eq = () => q;
  q.limit = () => q;

  q.maybeSingle = () => {
    if (table === "workspaces") return Promise.resolve({ data: existing, error: lookupError });
    if (table === "profiles") return Promise.resolve({ data: profile, error: null });
    return Promise.resolve({ data: null, error: null });
  };

  q.insert = (row: Row) => {
    insertRow = row;
    insertedWorkspaces.push(row);
    return q;
  };

  q.single = () =>
    Promise.resolve({
      data:
        insertRow !== null
          ? { id: "ws-new", name: insertRow.name, plan_code: insertRow.plan_code }
          : null,
      error: insertError,
    });

  q.upsert = (row: Row) => {
    upsertedMembers.push(row);
    return Promise.resolve({ error: null });
  };

  return q;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { ensureWorkspace } from "@/lib/workspace/server";

beforeEach(() => {
  existing = null;
  profile = null;
  lookupError = null;
  insertError = null;
  insertedWorkspaces.length = 0;
  upsertedMembers.length = 0;
});

describe("ensureWorkspace", () => {
  it("reutiliza workspace existente sem criar outro", async () => {
    existing = { id: "ws-1", name: "Ateliê de Ana", plan_code: "essencial" };

    const ws = await ensureWorkspace("user-1");

    expect(ws).toEqual({ id: "ws-1", name: "Ateliê de Ana", plan_code: "essencial" });
    expect(insertedWorkspaces).toHaveLength(0);
    expect(upsertedMembers).toHaveLength(0);
  });

  it("cria workspace e registra owner quando não existe", async () => {
    profile = { display_name: "Ana Souza" };

    const ws = await ensureWorkspace("user-1");

    expect(ws?.id).toBe("ws-new");
    expect(insertedWorkspaces).toHaveLength(1);
    expect(insertedWorkspaces[0]).toMatchObject({
      owner_id: "user-1",
      name: "Ateliê de Ana",
      plan_code: "essencial",
    });
    expect(upsertedMembers).toHaveLength(1);
    expect(upsertedMembers[0]).toMatchObject({
      workspace_id: "ws-new",
      profile_id: "user-1",
      member_role: "owner",
    });
  });

  it("usa 'Meu' quando o perfil não tem nome", async () => {
    profile = { display_name: null };

    await ensureWorkspace("user-1");

    expect(insertedWorkspaces[0]?.name).toBe("Ateliê de Meu");
  });

  it("devolve null sem lançar quando a criação falha", async () => {
    insertError = { code: "23505" };

    await expect(ensureWorkspace("user-1")).resolves.toBeNull();
  });

  it("devolve null sem lançar quando a consulta falha", async () => {
    lookupError = { code: "PGRST301" };

    await expect(ensureWorkspace("user-1")).resolves.toBeNull();
  });
});
