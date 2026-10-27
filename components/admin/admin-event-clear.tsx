"use client";

import { useActionState } from "react";

import { clearEventsAction, type AdminEventActionState } from "@/app/admin/eventos/actions";
import { BULK_CLEAR_CONFIRMATION } from "@/lib/events/lifecycle";

const initialState: AdminEventActionState = {};

/**
 * Limpeza da lista de eventos: exclui (soft delete) todos os que ainda não
 * estão cancelados.
 *
 * É um UPDATE filtrado, não um DELETE: os eventos passam a `canceled` e todo o
 * histórico financeiro continua auditável. A confirmação digitada existe porque
 * a ação atinge vários clientes de uma vez.
 */
export function AdminEventClear({ pendingCount }: { pendingCount: number }) {
  const [state, action, pending] = useActionState(clearEventsAction, initialState);
  const disabled = pending || pendingCount === 0;

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-caption text-vinho/70">
        Exclui todos os eventos que ainda não estão cancelados ({String(pendingCount)} agora) —
        rascunhos, aguardando pagamento e ativos. Eles saem das listas e os disparos param; nada é
        apagado do banco.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirm"
          aria-label={`Digite ${BULK_CLEAR_CONFIRMATION} para confirmar`}
          placeholder={`Digite ${BULK_CLEAR_CONFIRMATION}`}
          autoComplete="off"
          disabled={disabled}
          className="w-40 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm uppercase"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full border border-semantic-error/40 px-4 py-2 text-sm font-semibold text-semantic-error transition hover:bg-semantic-error/10 disabled:opacity-50"
        >
          {pending ? "Excluindo…" : "Limpar eventos"}
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
