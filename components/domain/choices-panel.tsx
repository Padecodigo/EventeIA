"use client";

import { useActionState } from "react";

import {
  chooseQuotationOptionAction,
  type QuotationChoiceState,
} from "@/app/(dashboard)/eventos/[id]/choices-actions";
import { Button } from "@/components/ui/button";

export interface ChoiceOptionView {
  index: number;
  name: string;
  description: string | null;
  includes: string[];
  amountFormatted: string;
}

export interface ChoiceRowView {
  quotationId: string;
  vendorName: string;
  categoryLabel: string;
  vendorContact: string | null;
  options: ChoiceOptionView[];
  chosenIndex: number | null;
}

const initialState: QuotationChoiceState = {};

function ChoiceRow({ eventId, row }: { eventId: string; row: ChoiceRowView }) {
  const [state, action, pending] = useActionState(chooseQuotationOptionAction, initialState);

  return (
    <article className="rounded-xl border border-line-subtle p-4">
      <p className="text-sm font-semibold text-vinho">
        {row.vendorName} <span className="font-normal text-vinho/60">· {row.categoryLabel}</span>
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {row.options.map((option) => {
          const chosen = row.chosenIndex === option.index;
          return (
            <li
              key={option.index}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-subtle/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-vinho">
                  <span className="font-medium">{option.name}</span>
                  {option.description !== null ? (
                    <span className="text-vinho/70"> — {option.description}</span>
                  ) : null}
                </p>
                {option.includes.length > 0 ? (
                  <p className="text-caption text-vinho/60">Inclui: {option.includes.join(", ")}</p>
                ) : null}
                <p className="text-sm tabular-nums text-vinho/80">{option.amountFormatted}</p>
              </div>
              {chosen ? (
                <span className="rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
                  Escolhida
                </span>
              ) : (
                <form action={action}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="quotationId" value={row.quotationId} />
                  <input type="hidden" name="optionIndex" value={option.index} />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    {pending ? "Salvando…" : "Escolher"}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.ok === true ? (
        <p className="mt-2 text-caption text-vinho/70">
          {state.relayed === true
            ? "Escolha registrada e enviada ao fornecedor."
            : "Escolha registrada."}
        </p>
      ) : null}
    </article>
  );
}

/** Painel de escolhas: apareça só quando alguma cotação oferece mais de uma opção. */
export function ChoicesPanel({ eventId, rows }: { eventId: string; rows: ChoiceRowView[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Escolhas do fornecedor</h2>
      <p className="mt-2 max-w-prose text-sm text-vinho/70">
        Alguns fornecedores oferecem mais de uma opção. Escolha a que prefere — registramos aqui e
        avisamos o fornecedor quando possível.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <ChoiceRow key={row.quotationId} eventId={eventId} row={row} />
        ))}
      </div>
    </section>
  );
}
