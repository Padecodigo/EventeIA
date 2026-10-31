"use client";

import { useActionState } from "react";

import {
  createQuotationAction,
  type QuotationState,
} from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const initialState: QuotationState = {};

export function QuotationForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(createQuotationAction, initialState);

  return (
    <form action={formAction} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quotation-category" className="text-sm font-medium text-vinho">
          Categoria
        </label>
        <select
          id="quotation-category"
          name="category"
          required
          defaultValue="buffet"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        >
          <option value="buffet">Buffet</option>
          <option value="decoracao">Decoração</option>
          <option value="musica">Música</option>
          <option value="fotografia">Fotografia</option>
          <option value="espaco">Espaço</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <Field label="Fornecedor" name="vendorName" required maxLength={80} placeholder="Buffet da Vila" />
      <Field
        label="Contato (opcional)"
        name="vendorContact"
        maxLength={80}
        placeholder="Telefone ou e-mail"
      />
      <Field
        label="Valor da proposta"
        name="amount"
        required
        inputMode="decimal"
        placeholder="4.200,00"
        hint="Use vírgula para centavos. O valor é salvo em centavos."
      />

      {state.error !== undefined ? (
        <p role="alert" className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.success === true ? (
        <p className="md:col-span-2 rounded-xl bg-champagne-claro/60 px-4 py-3 text-sm text-vinho">
          Cotação registrada.
        </p>
      ) : null}

      <div className="md:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Salvando…" : "Adicionar cotação"}
        </Button>
      </div>
    </form>
  );
}
