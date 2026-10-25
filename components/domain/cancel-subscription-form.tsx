"use client";

import { useActionState } from "react";

import {
  cancelSubscriptionAction,
  type CancelSubscriptionState,
} from "@/app/(dashboard)/creditos/actions";
import { Button } from "@/components/ui/button";

const initialState: CancelSubscriptionState = {};

export function CancelSubscriptionForm() {
  const [state, formAction, pending] = useActionState(cancelSubscriptionAction, initialState);

  return (
    <form action={formAction} className="mt-4">
      <Button type="submit" variant="secondary" disabled={pending || state.success === true}>
        {pending ? "Cancelando…" : "Cancelar renovação automática"}
      </Button>
      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.success === true ? (
        <p className="mt-2 text-sm">Renovação cancelada. Seus créditos continuam disponíveis.</p>
      ) : null}
    </form>
  );
}
