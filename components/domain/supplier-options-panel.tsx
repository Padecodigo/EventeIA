"use client";

import { useActionState } from "react";

import {
  selectSupplierOptionAction,
  type SupplierSelectionState,
} from "@/app/(dashboard)/eventos/[id]/selection-actions";
import { Button } from "@/components/ui/button";

export interface SupplierOptionCardView {
  optionId: string;
  name: string;
  description: string | null;
  priceFormatted: string;
  unitLabel: string;
}

export interface SupplierOptionsRowView {
  supplierId: string;
  supplierName: string;
  categoryLabel: string;
  options: SupplierOptionCardView[];
  selectedOptionId: string | null;
  status: string | null;
}

const statusLabels: Record<string, string> = {
  pendente: "Aguardando envio ao fornecedor",
  enviado_ao_fornecedor: "Enviada ao fornecedor",
  aguardando_resposta: "Aguardando resposta do fornecedor",
  respondido: "Fornecedor respondeu",
  canal_fechado: "Canal fechado",
  indisponivel: "Fornecedor indisponível",
};

const initialState: SupplierSelectionState = {};

function SupplierOptionsRow({ eventId, row }: { eventId: string; row: SupplierOptionsRowView }) {
  const [state, action, pending] = useActionState(selectSupplierOptionAction, initialState);

  return (
    <article className="rounded-xl border border-line-subtle p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-vinho">
          {row.supplierName}{" "}
          <span className="font-normal text-vinho/60">· {row.categoryLabel}</span>
        </p>
        {row.status !== null ? (
          <span className="rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
            {statusLabels[row.status] ?? row.status}
          </span>
        ) : null}
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {row.options.map((option) => {
          const chosen = row.selectedOptionId === option.optionId;
          return (
            <div
              key={option.optionId}
              className="flex flex-col justify-between gap-3 rounded-lg border border-line-subtle/70 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-vinho">{option.name}</p>
                {option.description !== null && option.description.length > 0 ? (
                  <p className="mt-1 text-caption text-vinho/70">{option.description}</p>
                ) : null}
                <p className="mt-2 text-base tabular-nums text-vinho">{option.priceFormatted}</p>
                <p className="text-caption text-vinho/60">{option.unitLabel}</p>
              </div>
              {chosen ? (
                <span className="self-start rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
                  Escolhida
                </span>
              ) : (
                <form action={action}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="supplierId" value={row.supplierId} />
                  <input type="hidden" name="optionId" value={option.optionId} />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    {pending ? "Salvando…" : "Escolher"}
                  </Button>
                </form>
              )}
            </div>
          );
        })}
      </div>

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

/**
 * Seleção de produtos no nível de categoria: opções lado a lado com preço para
 * comparação. O sistema NUNCA pré-seleciona — escolher exige uma ação explícita.
 */
export function SupplierOptionsPanel({
  eventId,
  rows,
}: {
  eventId: string;
  rows: SupplierOptionsRowView[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Produtos e opções dos fornecedores</h2>
      <p className="mt-2 max-w-prose text-sm text-vinho/70">
        Compare as opções oferecidas por cada fornecedor e escolha a que prefere. Nenhuma opção é
        pré-selecionada — a escolha é sempre sua.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <SupplierOptionsRow key={row.supplierId} eventId={eventId} row={row} />
        ))}
      </div>
    </section>
  );
}
