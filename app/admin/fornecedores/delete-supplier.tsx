"use client";

import { useActionState, useRef } from "react";

import type { OpResult } from "@/lib/admin/suppliers";

import { deleteSupplierAction } from "./actions";

/** "Excluir fornecedor" com diálogo de confirmação (exclusão reversível pela Lixeira). */
export function DeleteSupplier({ supplierId, name }: { supplierId: string; name: string }) {
  const [state, action, pending] = useActionState<OpResult | null, FormData>(deleteSupplierAction, null);
  const ref = useRef<HTMLDialogElement>(null);
  if (state?.ok) return <p role="status" className="text-sm text-vinho/70">Fornecedor excluído. Ele está na Lixeira e pode ser restaurado.</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <button type="button" data-testid="supplier-delete" onClick={() => ref.current?.showModal()}
        className="self-start rounded-full border border-semantic-error/40 px-4 py-2 font-semibold text-semantic-error hover:bg-semantic-error/10">
        Excluir fornecedor
      </button>
      {state && !state.ok ? <p role="alert" className="text-semantic-error">{state.error}</p> : null}
      <dialog ref={ref} aria-labelledby="supplier-delete-title" className="w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40">
        <h4 id="supplier-delete-title" className="font-serif text-title-3">Excluir este fornecedor?</h4>
        <p className="mt-1 text-caption text-vinho/70">Ele sai das listas do admin e não será mais usado na busca automática nem contatado. O histórico fica guardado e dá para restaurar pela Lixeira.</p>
        <ul className="mt-3 list-disc pl-5"><li>{name}</li></ul>
        <form action={action} onSubmit={() => ref.current?.close()} className="mt-4 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="supplierId" value={supplierId} />
          <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Cancelar</button>
          <button data-testid="supplier-delete-confirm" disabled={pending} className="rounded-full bg-semantic-error px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar exclusão</button>
        </form>
      </dialog>
    </div>
  );
}
