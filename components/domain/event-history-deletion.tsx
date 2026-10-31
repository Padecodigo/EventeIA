"use client";

import { useActionState, useState } from "react";

import {
  deleteEventHistoryAction,
  undoEventDeletionAction,
  type HistoryDeletionState,
} from "@/app/(dashboard)/perfil/history-actions";
import { Button } from "@/components/ui/button";
import {
  DELETE_CONFIRMATION_WORD,
  DELETION_KEEPS,
  DELETION_REMOVES,
  HISTORY_UNDO_DAYS,
} from "@/lib/events/history-deletion";

const initialState: HistoryDeletionState = {};

export interface ClosedEventView {
  id: string;
  title: string;
  dateLabel: string;
  statusLabel: string;
}

export interface DeletedEventView {
  id: string;
  title: string;
  purgeAfterLabel: string;
}

type Target = { scope: "all" } | { scope: "one"; eventId: string; title: string };

function ConfirmDeletionDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteEventHistoryAction, initialState);
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-delete-title"
      data-testid="history-delete-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-vinho/40 p-4"
    >
      <div className="w-full max-w-lg rounded-card bg-off-white p-6 shadow-soft">
        <h3 id="history-delete-title" className="font-serif text-title-2">
          {target.scope === "all" ? "Apagar todo o histórico?" : `Apagar “${target.title}”?`}
        </h3>
        {state.deleted !== undefined ? (
          <div role="status" className="mt-4 flex flex-col gap-4 text-sm text-vinho">
            <p>
              {state.deleted === 1 ? "1 evento apagado." : `${String(state.deleted)} eventos apagados.`} Você
              pode desfazer por {HISTORY_UNDO_DAYS} dias.
            </p>
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <form action={formAction} className="mt-4 flex flex-col gap-4 text-sm text-vinho">
            <input type="hidden" name="scope" value={target.scope} />
            {target.scope === "one" ? <input type="hidden" name="eventId" value={target.eventId} /> : null}
            <div>
              <p className="font-medium">Será apagado:</p>
              <ul className="mt-1 list-disc pl-5 text-vinho/80">
                {DELETION_REMOVES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Fica guardado (obrigação legal e dados de terceiros):</p>
              <ul className="mt-1 list-disc pl-5 text-vinho/80">
                {DELETION_KEEPS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="text-vinho/80">
              O evento some na hora. Você tem {HISTORY_UNDO_DAYS} dias para desfazer; depois disso a
              exclusão é definitiva.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="history-delete-confirmation" className="font-medium">
                Digite {DELETE_CONFIRMATION_WORD} para confirmar
              </label>
              <input
                id="history-delete-confirmation"
                name="confirmation"
                autoComplete="off"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
              />
            </div>
            {state.error !== undefined ? (
              <p role="alert" className="rounded-xl bg-semantic-error/10 px-4 py-3 text-semantic-error">
                {state.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!confirmed || pending}>
                {pending ? "Apagando…" : "Apagar definitivamente em 30 dias"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function UndoButton({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(undoEventDeletionAction, initialState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="secondary" disabled={pending || state.undone === true}>
        {state.undone === true ? "Restaurado" : pending ? "Desfazendo…" : "Desfazer"}
      </Button>
      {state.error !== undefined ? (
        <span role="alert" className="text-caption text-semantic-error">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Perfil → histórico de eventos encerrados: apagar um/todos (com APAGAR) e desfazer em 30 dias. */
export function EventHistoryDeletion({
  closedEvents,
  deletedEvents,
}: {
  closedEvents: ClosedEventView[];
  deletedEvents: DeletedEventView[];
}) {
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <section
      id="historico"
      data-testid="event-history-deletion"
      className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft sm:p-8"
    >
      <h2 className="font-serif text-title-2">Histórico de eventos</h2>
      <p className="mt-2 text-sm leading-6 text-vinho/75">
        Apague eventos encerrados e o que está ligado a eles. Eventos em andamento não podem ser
        apagados.
      </p>

      {closedEvents.length === 0 ? (
        <p className="mt-4 text-sm text-vinho/70">Nenhum evento encerrado no histórico.</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col divide-y divide-line-subtle">
            {closedEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-vinho [overflow-wrap:anywhere]">{event.title}</p>
                  <p className="text-caption text-vinho/70">
                    {event.dateLabel} · {event.statusLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setTarget({ scope: "one", eventId: event.id, title: event.title })}
                >
                  Apagar
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setTarget({ scope: "all" })}>
              Apagar todo o histórico
            </Button>
          </div>
        </>
      )}

      {deletedEvents.length > 0 ? (
        <div className="mt-6" data-testid="deleted-events">
          <h3 className="text-sm font-semibold text-vinho">Apagados recentemente</h3>
          <ul className="mt-2 flex flex-col divide-y divide-line-subtle">
            {deletedEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-vinho [overflow-wrap:anywhere]">{event.title}</p>
                  <p className="text-caption text-vinho/70">Exclusão definitiva em {event.purgeAfterLabel}</p>
                </div>
                <UndoButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {target !== null ? <ConfirmDeletionDialog target={target} onClose={() => setTarget(null)} /> : null}
    </section>
  );
}
