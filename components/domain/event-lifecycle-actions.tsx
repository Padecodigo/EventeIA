"use client";

import { useActionState, useState } from "react";

import {
  cancelEventAction,
  completeEventAction,
  type EventLifecycleState,
} from "@/app/(dashboard)/eventos/[id]/actions";
import { Button } from "@/components/ui/button";

const initialState: EventLifecycleState = {};

type ConfirmationKind = "complete" | "cancel";

const CONFIRMATIONS: Record<
  ConfirmationKind,
  { title: string; body: string; confirm: string; pending: string }
> = {
  complete: {
    title: "Encerrar o evento?",
    body: "O evento será marcado como concluído e a coleta de cotações será finalizada.",
    confirm: "Encerrar",
    pending: "Encerrando…",
  },
  cancel: {
    title: "Excluir o evento?",
    body: "O evento sairá da sua lista e os disparos serão interrompidos. Esta ação não pode ser desfeita. Se o evento já emitiu cotações, o tíquete não é reembolsado.",
    confirm: "Excluir",
    pending: "Excluindo…",
  },
};

/** Ações de ciclo de vida do evento: encerrar (concluir) e excluir (soft delete). */
export function EventLifecycleActions({
  eventId,
  canComplete,
  canCancel,
}: {
  eventId: string;
  canComplete: boolean;
  canCancel: boolean;
}) {
  const [completeState, completeAction, completing] = useActionState(
    completeEventAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelEventAction,
    initialState,
  );
  const [confirming, setConfirming] = useState<ConfirmationKind | null>(null);

  if (!canComplete && !canCancel) {
    return null;
  }

  const pending = completing || cancelling;
  // Some sozinha quando a página revalida e a ação deixa de ser permitida.
  const visibleConfirmation =
    confirming === "complete" && canComplete
      ? "complete"
      : confirming === "cancel" && canCancel
        ? "cancel"
        : null;
  const error =
    visibleConfirmation === "complete"
      ? completeState.error
      : visibleConfirmation === "cancel"
        ? cancelState.error
        : undefined;

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canComplete ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setConfirming("complete")}
          >
            Encerrar evento
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming("cancel")}
          >
            Excluir evento
          </Button>
        ) : null}
      </div>

      {visibleConfirmation !== null ? (
        <div className="w-full max-w-sm rounded-card border border-line-strong bg-white p-4 text-left shadow-soft">
          <p className="text-sm font-semibold text-vinho">
            {CONFIRMATIONS[visibleConfirmation].title}
          </p>
          <p className="mt-1 text-caption leading-5 text-vinho/75">
            {CONFIRMATIONS[visibleConfirmation].body}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirming(null)}
            >
              Voltar
            </Button>
            <form action={visibleConfirmation === "complete" ? completeAction : cancelAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <Button type="submit" variant="primary" disabled={pending}>
                {pending
                  ? CONFIRMATIONS[visibleConfirmation].pending
                  : CONFIRMATIONS[visibleConfirmation].confirm}
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {error !== undefined ? (
        <p role="alert" className="text-sm text-semantic-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
