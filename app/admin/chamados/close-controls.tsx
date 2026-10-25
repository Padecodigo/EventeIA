"use client";

import { useActionState, useRef } from "react";

import { adminCloseTicketAction, adminDeleteTicketAction, adminReopenTicketAction } from "./actions";

type S = { ok?: boolean; error?: string } | null;

export function CloseControls({ ticketId, closed, subject }: { ticketId: string; closed: boolean; subject: string }) {
  const [closeState, closeAction, closing] = useActionState<S, FormData>(closed ? adminReopenTicketAction : adminCloseTicketAction, null);
  const [delState, delAction, deleting] = useActionState<S, FormData>(adminDeleteTicketAction, null);
  const ref = useRef<HTMLDialogElement>(null);
  const err = closeState?.error ?? delState?.error;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <form action={closeAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <button data-testid={closed ? "ticket-reopen" : "ticket-close"} disabled={closing}
            className="rounded-full bg-vinho px-4 py-2 font-semibold text-off-white disabled:opacity-60">
            {closed ? "Reabrir chamado" : "Encerrar chamado"}
          </button>
        </form>
        <button type="button" data-testid="ticket-delete" onClick={() => ref.current?.showModal()}
          className="rounded-full border border-semantic-error/40 px-4 py-2 font-semibold text-semantic-error hover:bg-semantic-error/10">
          Excluir
        </button>
      </div>
      <p className="text-caption text-vinho/60">
        {closed
          ? "“Reabrir” volta o chamado para Aberto e ele reaparece no filtro de abertos."
          : "“Encerrar” muda o status para Fechado e registra quem encerrou e quando. Dá para reabrir depois."}{" "}
        “Excluir” tira o chamado das listas do admin (exclusão reversível: nada é apagado de verdade).
      </p>
      {err ? <p role="alert" className="text-semantic-error">{err}</p> : null}
      <dialog ref={ref} aria-labelledby="ticket-delete-title" className="w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40">
        <h4 id="ticket-delete-title" className="font-serif text-title-3">Excluir este chamado?</h4>
        <p className="mt-1 text-caption text-vinho/70">Será excluído 1 chamado. Ele some das listas do admin, mas a conversa e o anexo ficam guardados e podem ser recuperados pelo suporte técnico.</p>
        <ul className="mt-3 list-disc pl-5"><li>{subject}</li></ul>
        <form action={delAction} onSubmit={() => ref.current?.close()} className="mt-4 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Cancelar</button>
          <button data-testid="ticket-delete-confirm" disabled={deleting} className="rounded-full bg-semantic-error px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar exclusão</button>
        </form>
      </dialog>
    </div>
  );
}
