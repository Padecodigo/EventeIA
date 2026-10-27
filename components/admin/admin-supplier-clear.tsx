"use client";

import { useActionState } from "react";

import { clearSuppliersAction, type SupplierClearState } from "@/app/admin/fornecedores/actions";
import { SUPPLIERS_CLEAR_CONFIRMATION } from "@/lib/admin/suppliers";

const initialState: SupplierClearState = {};

/**
 * Limpeza da lista de fornecedores: todos vão para a Lixeira de uma vez.
 *
 * É soft delete (deleted_at/deleted_by), reversível pela própria Lixeira. A
 * confirmação digitada existe porque a ação atinge todos os registros vivos.
 */
export function AdminSupplierClear({ liveCount }: { liveCount: number }) {
  const [state, action, pending] = useActionState(clearSuppliersAction, initialState);
  const disabled = pending || liveCount === 0;

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-caption text-vinho/70">
        Envia todos os fornecedores vivos ({String(liveCount)} agora) para a Lixeira. Eles saem das
        listas, da busca automática e dos contatos — e podem ser restaurados depois.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirm"
          aria-label={`Digite ${SUPPLIERS_CLEAR_CONFIRMATION} para confirmar`}
          placeholder={`Digite ${SUPPLIERS_CLEAR_CONFIRMATION}`}
          autoComplete="off"
          disabled={disabled}
          className="w-40 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm uppercase"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full border border-semantic-error/40 px-4 py-2 text-sm font-semibold text-semantic-error transition hover:bg-semantic-error/10 disabled:opacity-50"
        >
          {pending ? "Limpando…" : "Limpar fornecedores"}
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
