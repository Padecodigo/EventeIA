"use client";

import { useActionState, useState } from "react";

import {
  updateBudgetLimitAction,
  type BudgetLimitState,
} from "@/app/(dashboard)/eventos/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatBudgetLimitInput } from "@/lib/events/budget-limit";

const initialState: BudgetLimitState = {};

export interface BudgetLimitHistoryView {
  id: string;
  changedAtLabel: string;
  oldLabel: string;
  newLabel: string;
  sourceLabel: string;
}

export interface EventBudgetLimitEditorProps {
  eventId: string;
  budgetLimitCents: number | null;
  limitLabel: string;
  canEdit: boolean;
  aboveLimitCount: number;
  history: BudgetLimitHistoryView[];
}

/** Orçamento limite do evento: leitura, edição (dono/admin) e histórico de alterações. */
export function EventBudgetLimitEditor({
  eventId,
  budgetLimitCents,
  limitLabel,
  canEdit,
  aboveLimitCount,
  history,
}: EventBudgetLimitEditorProps) {
  const [state, formAction, pending] = useActionState(updateBudgetLimitAction, initialState);
  const [editing, setEditing] = useState(false);

  return (
    <section
      id="orcamento-limite"
      data-testid="event-budget-limit-editor"
      className="scroll-mt-24 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-title-2">Orçamento limite</h2>
          <p className="mt-1 text-sm text-vinho/75">
            Quanto você pretende gastar no evento. Opções acima do limite aparecem sinalizadas — nunca
            escondidas: quem decide é você.
          </p>
          <p data-testid="budget-limit-value" className="mt-3 text-title-3 tabular-nums text-vinho">
            {limitLabel}
          </p>
          {aboveLimitCount > 0 ? (
            <p role="status" className="mt-1 text-caption text-vinho/70">
              {aboveLimitCount === 1
                ? "1 opção está acima do seu limite."
                : `${String(aboveLimitCount)} opções estão acima do seu limite.`}
            </p>
          ) : null}
        </div>
        {canEdit && !editing ? (
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        ) : null}
      </div>

      {canEdit && editing ? (
        <form
          action={formAction}
          className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto_auto]"
        >
          <input type="hidden" name="eventId" value={eventId} />
          <Field
            label="Novo orçamento limite (R$)"
            name="budgetLimit"
            inputMode="decimal"
            placeholder="Ex.: 25.000,00"
            defaultValue={formatBudgetLimitInput(budgetLimitCents)}
            hint="Deixe em branco para remover o limite."
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar limite"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}

      {state.error !== undefined ? (
        <p role="alert" className="mt-3 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.saved === true ? (
        <p role="status" className="mt-3 text-sm text-vinho/75">
          Orçamento limite salvo.
        </p>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-4 text-sm text-vinho/80">
          <summary className="cursor-pointer">Histórico de alterações ({history.length})</summary>
          <ul className="mt-2 flex flex-col gap-1" data-testid="budget-limit-history">
            {history.map((h) => (
              <li key={h.id} className="tabular-nums">
                {h.changedAtLabel}: {h.oldLabel} → {h.newLabel} ({h.sourceLabel})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
