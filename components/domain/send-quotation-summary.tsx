"use client";

import { useActionState } from "react";

import {
  sendQuotationSummaryAction,
  type QuotationSummaryState,
} from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";

const initialState: QuotationSummaryState = {};

export function SendQuotationSummary({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(sendQuotationSummaryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar resumo por WhatsApp"}
      </Button>
      {state.error !== undefined ? (
        <p role="alert" className="text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.success === true ? (
        <p className="text-sm text-vinho/75">Resumo enfileirado — chega pelo WhatsApp em instantes.</p>
      ) : null}
    </form>
  );
}
