"use client";

import { useActionState } from "react";

import { clearOwnEventsAction, type PanelEventState } from "@/app/(dashboard)/painel/actions";
import { BULK_CLEAR_CONFIRMATION } from "@/lib/events/lifecycle";

const initialState: PanelEventState = {};

/**
 * Limpa os eventos do painel de uma vez (soft delete de todos os não cancelados).
 *
 * Confirmação digitada porque a ação atinge todos os eventos do usuário.
 */
export function PanelEventsClear({ liveCount }: { liveCount: number }) {
  const [state, action, pending] = useActionState(clearOwnEventsAction, initialState);
  const disabled = pending || liveCount === 0;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="confirm"
        aria-label={`Digite ${BULK_CLEAR_CONFIRMATION} para confirmar`}
        placeholder={`Digite ${BULK_CLEAR_CONFIRMATION}`}
        autoComplete="off"
        disabled={disabled}
        className="w-36 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm uppercase"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-full border border-semantic-error/40 px-4 py-2 text-sm font-semibold text-semantic-error transition hover:bg-semantic-error/10 disabled:opacity-50"
      >
        {pending ? "Excluindo…" : `Limpar eventos (${String(liveCount)})`}
      </button>
      {state.error !== undefined ? (
        <p role="alert" className="w-full text-caption text-semantic-error">{state.error}</p>
      ) : null}
      {state.success !== undefined ? (
        <p role="status" className="w-full text-caption text-vinho/70">{state.success}</p>
      ) : null}
    </form>
  );
}
