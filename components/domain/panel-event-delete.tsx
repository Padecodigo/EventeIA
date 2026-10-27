"use client";

import { useActionState, useRef } from "react";

import { cancelOwnEventAction, type PanelEventState } from "@/app/(dashboard)/painel/actions";

const initialState: PanelEventState = {};

/**
 * Exclusão de um evento direto na lista do painel.
 *
 * Soft delete: o evento vira `canceled`, sai das listas e os disparos param. O
 * histórico financeiro continua guardado.
 */
export function PanelEventDelete({ eventId, title }: { eventId: string; title: string }) {
  const [state, action, pending] = useActionState(cancelOwnEventAction, initialState);
  const ref = useRef<HTMLDialogElement>(null);

  if (state.success !== undefined) {
    return <p role="status" className="text-caption text-vinho/60">Excluído.</p>;
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-full border border-line-strong px-3 py-1.5 text-caption text-vinho/70 transition hover:bg-areia-quente"
      >
        Excluir
      </button>
      {state.error !== undefined ? (
        <p role="alert" className="mt-1 max-w-[12rem] text-right text-caption text-semantic-error">
          {state.error}
        </p>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby="panel-event-delete-title"
        className="w-[min(30rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-left text-vinho shadow-soft backdrop:bg-black/40"
      >
        <h4 id="panel-event-delete-title" className="font-serif text-title-3">Excluir este evento?</h4>
        <p className="mt-1 text-caption text-vinho/70">
          Ele sai das suas listas e os disparos param. O histórico financeiro fica guardado — nada é
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
