"use client";

import Link from "next/link";

import { useActionState } from "react";

import {
  activateEventWithCreditAction,
  type ActivateEventState,
} from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";

const initialState: ActivateEventState = {};

export function ActivateWithCredit({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(activateEventWithCreditAction, initialState);

  return (
    <section className="rounded-card border border-champagne/50 bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Ativar com 1 crédito</h2>
      <p className="mt-2 text-sm leading-6 text-vinho/75">
        Este evento pertence ao seu workspace. A ativação consome <strong>1 crédito</strong> e libera
        o orçamento completo e as cotações.
      </p>

      <form action={formAction} className="mt-5 flex flex-col items-start gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        {state.error !== undefined ? (
          <p role="alert" className="text-sm text-semantic-error">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Ativando…" : "Usar 1 crédito"}
        </Button>
        <Link
          href="/creditos"
          className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
        >
          Comprar créditos
        </Link>
      </form>
    </section>
  );
}
