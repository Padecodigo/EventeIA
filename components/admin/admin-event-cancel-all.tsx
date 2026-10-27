"use client";

import { useActionState } from "react";

import { cancelActiveEventsAction, type AdminEventActionState } from "@/app/admin/eventos/actions";
import { BULK_CANCEL_CONFIRMATION } from "@/lib/events/lifecycle";

const initialState: AdminEventActionState = {};

/**
 * Cancelamento em massa dos eventos ativos.
 *
 * É um UPDATE filtrado, não um DELETE: os eventos passam a `canceled` e o
 * histórico continua auditável. A confirmação digitada existe porque a ação
 * atinge vários clientes de uma vez.
 */
export function AdminEventCancelAll({ activeCount }: { activeCount: number }) {
  const [state, action, pending] = useActionState(cancelActiveEventsAction, initialState);
  const disabled = pending || activeCount === 0;

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-caption text-vinho/70">
        Cancela todos os eventos <strong>ativos</strong> de uma vez ({String(activeCount)} agora). Os
        eventos saem das listas e os disparos param; nada é apagado do banco.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirm"
          aria-label={`Digite ${BULK_CANCEL_CONFIRMATION} para confirmar`}
          placeholder={`Digite ${BULK_CANCEL_CONFIRMATION}`}
          autoComplete="off"
          disabled={disabled}
          className="w-40 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm uppercase"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full border border-semantic-error/40 px-4 py-2 text-sm font-semibold text-semantic-error transition hover:bg-semantic-error/10 disabled:opacity-50"
        >
          {pending ? "Cancelando…" : "Cancelar todos os ativos"}
        </button>
      </div>
      {state.error !== undefined ? (
        <p role="alert" className="text-caption text-semantic-error">{state.error}</p>
      ) : null}
      {state.success !== undefined ? (
        <p role="status" className="text-caption text-vinho/70">{state.success}</p>
      ) : null}
    </form>
  );
}
