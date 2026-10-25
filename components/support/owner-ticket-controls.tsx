"use client";

import { useActionState, useRef, useState } from "react";

import type { OwnerTicketState } from "@/app/actions/support";

type Act = (prev: OwnerTicketState, fd: FormData) => Promise<OwnerTicketState>;

/** Editar (assunto/descrição, só aberto) e Excluir (com confirmação) o próprio chamado. */
export function OwnerTicketControls({ ticketId, subject, message, canEdit, editAction, deleteAction }: {
  ticketId: string;
  subject: string;
  message: string;
  canEdit: boolean;
  editAction: Act;
  deleteAction: Act;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, edit, saving] = useActionState<OwnerTicketState, FormData>(async (p, fd) => {
    const r = await editAction(p, fd);
    if (r?.ok) setEditing(false);
    return r;
  }, null);
  const [delState, del, deleting] = useActionState<OwnerTicketState, FormData>(deleteAction, null);
  const ref = useRef<HTMLDialogElement>(null);
  const err = (editState && !editState.ok ? editState.error : null) ?? (delState && !delState.ok ? delState.error : null);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing ? (
          <button type="button" data-testid="ticket-edit" onClick={() => setEditing(true)} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Editar</button>
        ) : null}
        <button type="button" data-testid="ticket-owner-delete" onClick={() => ref.current?.showModal()}
          className="rounded-full border border-semantic-error/40 px-4 py-2 font-semibold text-semantic-error hover:bg-semantic-error/10">Excluir</button>
      </div>
      {editState?.ok ? <p role="status" className="text-vinho/70">Chamado atualizado.</p> : null}
      {err ? <p role="alert" className="text-semantic-error">{err}</p> : null}
      {editing ? (
        <form action={edit} className="flex flex-col gap-2 rounded-2xl border border-line-subtle bg-white p-4" data-testid="ticket-edit-form">
          <input type="hidden" name="ticketId" value={ticketId} />
          <label className="text-caption">Assunto
            <input name="subject" defaultValue={subject} maxLength={140} required className="mt-1 block w-full rounded-input border border-line-subtle px-3 py-2 text-sm" />
          </label>
          <label className="text-caption">Descrição
            <textarea name="message" defaultValue={message} maxLength={5000} rows={5} required className="mt-1 block w-full rounded-input border border-line-subtle px-3 py-2 text-sm" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Cancelar</button>
            <button disabled={saving} className="rounded-full bg-vinho px-4 py-2 font-semibold text-off-white disabled:opacity-60">Salvar</button>
          </div>
        </form>
      ) : null}
      <dialog ref={ref} aria-labelledby="owner-delete-title" className="w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40">
        <h4 id="owner-delete-title" className="font-serif text-title-3">Excluir este chamado?</h4>
        <p className="mt-1 text-caption text-vinho/70">Ele sai da sua lista de chamados. A equipe de suporte ainda pode consultá-lo, se necessário.</p>
        <ul className="mt-3 list-disc pl-5"><li>{subject}</li></ul>
        <form action={del} onSubmit={() => ref.current?.close()} className="mt-4 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Cancelar</button>
          <button data-testid="ticket-owner-delete-confirm" disabled={deleting} className="rounded-full bg-semantic-error px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar exclusão</button>
        </form>
      </dialog>
    </div>
  );
}
