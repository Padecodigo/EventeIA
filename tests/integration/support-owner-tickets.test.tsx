// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: dono edita/exclui o próprio chamado; outra pessoa não consegue. */
const TID = "11111111-0000-4000-8000-000000000001";
let uid = "ana";
let ticket: Record<string, unknown>;
// jsdom não implementa <dialog>.showModal/close.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: uid, email: "x@y" }), isAdminUser: async () => false }));
vi.mock("@/lib/support/runtime", () => ({ createSupportDeps: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  // Imita as RPCs 0047 (auth.uid() = uid) e a RLS (dono só vê os próprios, não excluídos).
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, a: Record<string, string>) => {
      const own = a.p_ticket_id === TID && ticket.user_id === uid && ticket.deleted_at === null;
      if (fn === "support_ticket_owner_edit") {
        const ok = own && ticket.status === "aberto";
        if (ok) Object.assign(ticket, { subject: a.p_subject, message: a.p_message, edited_at: "agora" });
        return { data: ok, error: null };
      }
      if (own) ticket.deleted_at = "agora";
      return { data: own, error: null };
    },
    from: () => {
      const visible = () => (ticket.user_id === uid && ticket.deleted_at === null ? [ticket] : []);
      const b = { select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: visible()[0] ?? null, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: visible(), error: null }).then(r) };
      return b;
    },
  }),
}));

const { editOwnTicketAction, deleteOwnTicketAction } = await import("@/app/actions/support");
const { default: MyTicketPage } = await import("@/app/(dashboard)/chamados/[id]/page");
const { default: MyTicketsPage } = await import("@/app/(dashboard)/chamados/page");
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(() => {
  uid = "ana";
  ticket = { id: TID, user_id: "ana", type: "problema", subject: "Erro no pagamento", message: "Não consegui pagar com Pix.", status: "aberto", created_at: "2026-10-25T10:00:00Z", updated_at: "2026-10-25T10:00:00Z", edited_at: null, deleted_at: null };
});
afterEach(cleanup);

describe("meus chamados: editar e excluir", () => {
  it("dono vê Editar/Excluir e edita assunto/descrição", async () => {
    render(await MyTicketPage({ params: Promise.resolve({ id: TID }) }));
    fireEvent.click(screen.getByTestId("ticket-edit"));
    expect(screen.getByTestId("ticket-edit-form")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ticket-owner-delete"));
    expect(screen.getByText("Excluir este chamado?")).toBeInTheDocument();
    const r = await editOwnTicketAction(null, fd({ ticketId: TID, subject: "Erro no Pix", message: "Pix não gerou o QR code." }));
    expect(r).toEqual({ ok: true, ticketId: TID });
    expect(ticket).toMatchObject({ subject: "Erro no Pix", edited_at: "agora" });
  });

  it("dono exclui: some da lista dele e do detalhe", async () => {
    await expect(deleteOwnTicketAction(null, fd({ ticketId: TID }))).rejects.toThrow("REDIRECT:/chamados?excluido=1");
    expect(ticket.deleted_at).toBe("agora");
    render(await MyTicketsPage({ searchParams: Promise.resolve({ excluido: "1" }) }));
    expect(screen.queryByText("Erro no pagamento")).toBeNull();
    expect(screen.getByText("Chamado excluído.")).toBeInTheDocument();
  });

  it("outra usuária não edita nem exclui o chamado alheio", async () => {
    uid = "bia";
    expect((await editOwnTicketAction(null, fd({ ticketId: TID, subject: "Invasão", message: "Editando o chamado alheio" })))?.ok).toBe(false);
    expect((await deleteOwnTicketAction(null, fd({ ticketId: TID })))?.ok).toBe(false);
    expect(ticket).toMatchObject({ subject: "Erro no pagamento", deleted_at: null });
  });

  it("chamado fechado não mostra Editar", async () => {
    ticket.status = "fechado";
    render(await MyTicketPage({ params: Promise.resolve({ id: TID }) }));
    expect(screen.queryByTestId("ticket-edit")).toBeNull();
    expect(screen.getByTestId("ticket-owner-delete")).toBeInTheDocument();
  });
});
