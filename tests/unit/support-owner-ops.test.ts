import { describe, expect, it } from "vitest";

import { deleteOwnTicket, editOwnTicket, ownerCanEdit, type OwnerRpc } from "@/lib/support/owner-ops";

const TID = "11111111-0000-4000-8000-000000000001";

/** RPC falsa que imita o banco: só o dono (uid) altera, e edição só com status aberto. */
function fakeRpc(uid: string, ticket: { user_id: string; status: string; deleted_at: string | null; subject: string }) {
  return {
    rpc: (fn: string, args: Record<string, string>) => {
      const own = ticket.user_id === uid && ticket.deleted_at === null && args.p_ticket_id === TID;
      if (fn === "support_ticket_owner_edit") {
        const ok = own && ownerCanEdit(ticket.status);
        if (ok) ticket.subject = args.p_subject;
        return Promise.resolve({ data: ok, error: null });
      }
      if (own) ticket.deleted_at = "now";
      return Promise.resolve({ data: own, error: null });
    },
  } as unknown as OwnerRpc;
}

describe("chamado do próprio usuário", () => {
  it("dono edita e exclui", async () => {
    const t = { user_id: "ana", status: "aberto", deleted_at: null as string | null, subject: "Antigo" };
    expect(await editOwnTicket(fakeRpc("ana", t), { ticketId: TID, subject: "Novo assunto", message: "Descrição nova e completa" })).toEqual({ ok: true, ticketId: TID });
    expect(t.subject).toBe("Novo assunto");
    expect(await deleteOwnTicket(fakeRpc("ana", t), TID)).toEqual({ ok: true, ticketId: TID });
    expect(t.deleted_at).not.toBeNull();
  });

  it("outra pessoa não edita nem exclui", async () => {
    const t = { user_id: "ana", status: "aberto", deleted_at: null as string | null, subject: "Antigo" };
    expect((await editOwnTicket(fakeRpc("bia", t), { ticketId: TID, subject: "Invasão", message: "Tentando editar alheio" })).ok).toBe(false);
    expect((await deleteOwnTicket(fakeRpc("bia", t), TID)).ok).toBe(false);
    expect(t).toMatchObject({ subject: "Antigo", deleted_at: null });
  });

  it("valida entrada e status", async () => {
    const t = { user_id: "ana", status: "fechado", deleted_at: null as string | null, subject: "Antigo" };
    expect((await editOwnTicket(fakeRpc("ana", t), { ticketId: TID, subject: "x", message: "curta" })).ok).toBe(false);
    expect((await editOwnTicket(fakeRpc("ana", t), { ticketId: TID, subject: "Válido", message: "Descrição longa o bastante" })).ok).toBe(false);
    expect(ownerCanEdit("em_andamento")).toBe(true);
    expect(ownerCanEdit("resolvido")).toBe(false);
    expect(ownerCanEdit("aberto", "2026-01-01")).toBe(false);
    expect((await deleteOwnTicket(fakeRpc("ana", t), "nao-uuid")).ok).toBe(false);
  });
});
