"use client";

import { useActionState } from "react";

import {
  chooseQuotationOptionAction,
  type QuotationChoiceState,
} from "@/app/(dashboard)/eventos/[id]/choices-actions";
import { Button } from "@/components/ui/button";
import { contactHandoffConsentText } from "@/lib/quotes/handoff";

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
  const chosenIndex = row.chosenIndex;

  return (
    <article className="rounded-xl border border-line-subtle p-4">
      <p className="text-sm font-semibold text-vinho">
        {row.vendorName} <span className="font-normal text-vinho/60">· {row.categoryLabel}</span>
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="quotationId" value={row.quotationId} />
        {chosenIndex !== null ? (
          <input type="hidden" name="optionIndex" value={chosenIndex} />
        ) : null}
        <ul className="flex flex-col gap-2">
          {row.options.map((option) => {
            const chosen = chosenIndex === option.index;
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
                ) : chosenIndex === null ? (
                  <Button
                    type="submit"
                    variant="secondary"
                    name="optionIndex"
                    value={option.index}
                    disabled={pending}
                  >
                    {pending ? "Salvando…" : "Escolher"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        <label className="mt-3 flex items-start gap-2 text-caption leading-5 text-vinho/70">
          <input type="checkbox" name="consent" value="on" className="mt-1 accent-primaria" />
          <span>{contactHandoffConsentText(row.vendorName)}</span>
        </label>

        {chosenIndex !== null ? (
          <div className="mt-3">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Autorizando…" : "Autorizar contato"}
            </Button>
          </div>
        ) : null}
      </form>

      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.ok === true ? (
        <div className="mt-2 text-caption text-vinho/70">
          <p>{state.handoffMessage ?? (state.relayed === true ? "Escolha registrada e enviada ao fornecedor." : "Escolha registrada.")}</p>
          {state.fallbackUrl !== null && state.fallbackUrl !== undefined ? (
            <p className="mt-1">
              <a
                href={state.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primaria underline decoration-primaria/40 underline-offset-4"
              >
                Falar com o fornecedor no Instagram
              </a>
            </p>
          ) : null}
        </div>
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
        Alguns fornecedores oferecem mais de uma opção. Escolha a que prefere — registramos aqui e,
        com a sua autorização, repassamos seu contato ao fornecedor.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <ChoiceRow key={row.quotationId} eventId={eventId} row={row} />
        ))}
      </div>
    </section>
  );
}
