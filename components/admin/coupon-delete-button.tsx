"use client";

import { useActionState, useState } from "react";

import { deleteCouponAction, type CouponAdminState } from "@/app/admin/cupons/actions";

const initialState: CouponAdminState = {};

/**
 * Exclusão de cupom com confirmação em duas etapas.
 *
 * A confirmação existe porque a ação é destrutiva e irreversível; o erro do
 * servidor aparece na própria linha — em especial quando o cupom já tem usos e
 * a resposta correta é desativar em vez de excluir.
 */
export function CouponDeleteButton({ couponId, code }: { couponId: string; code: string }) {
  const [state, action, pending] = useActionState(deleteCouponAction, initialState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-line-strong px-4 py-2 text-caption text-vinho/80 transition hover:bg-areia-quente"
      >
        Excluir
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="couponId" value={couponId} />
      <p className="text-caption text-vinho/75">
        Excluir <span className="font-semibold uppercase">{code}</span>?
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-full border border-line-strong px-3 py-1.5 text-caption text-vinho/80 transition hover:bg-areia-quente disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-vinho px-3 py-1.5 text-caption text-off-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Excluindo…" : "Confirmar"}
        </button>
      </div>
      {state.error !== undefined ? (
        <p role="alert" className="max-w-[16rem] text-caption text-semantic-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
