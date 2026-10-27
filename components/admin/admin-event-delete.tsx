"use client";

import { useActionState, useRef } from "react";

import { deleteEventAction, type AdminEventActionState } from "@/app/admin/eventos/actions";

const initialState: AdminEventActionState = {};

/**
 * Exclusão de evento no painel, com confirmação em diálogo.
 *
 * É soft delete: o evento passa a `canceled`, sai das listas e para os
 * disparos, mas o histórico (pagamentos, cotações) continua auditável.
 */
export function AdminEventDelete({ eventId, title }: { eventId: string; title: string }) {
  const [state, action, pending] = useActionState(deleteEventAction, initialState);
  const ref = useRef<HTMLDialogElement>(null);

  if (state.success !== undefined) {
    return <p role="status" className="text-caption text-vinho/60">Excluído.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-full border border-semantic-error/40 px-3 py-1.5 text-caption font-semibold text-semantic-error transition hover:bg-semantic-error/10"
      >
        Excluir
      </button>
      {state.error !== undefined ? (
        <p role="alert" className="max-w-[14rem] text-caption text-semantic-error">
          {state.error}
        </p>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby="event-delete-title"
        className="w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40"
      >
        <h4 id="event-delete-title" className="font-serif text-title-3">Excluir este evento?</h4>
        <p className="mt-1 text-caption text-vinho/70">
          O evento sai das listas e os disparos param. O histórico financeiro fica guardado — nada é
          apagado do banco.
        </p>
        <p className="mt-3 font-semibold">{title}</p>
        <form action={action} onSubmit={() => ref.current?.close()} className="mt-4 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-full border border-line-strong px-4 py-2 text-caption font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-semantic-error px-4 py-2 text-caption font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Excluindo…" : "Confirmar exclusão"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
