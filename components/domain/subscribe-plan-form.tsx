"use client";

import { useActionState } from "react";

import { subscribeToPlanAction, type SubscribeState } from "@/app/(dashboard)/creditos/actions";
import { Button } from "@/components/ui/button";

const initialState: SubscribeState = {};

export interface SubscribePlanFormProps {
  planCode: string;
  planName: string;
  credits: number;
  priceFormatted: string;
}

export function SubscribePlanForm({
  planCode,
  planName,
  credits,
  priceFormatted,
}: SubscribePlanFormProps) {
  const [state, formAction, pending] = useActionState(subscribeToPlanAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="planCode" value={planCode} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Criando assinatura…" : `Assinar ${planName} (${priceFormatted}/mês)`}
      </Button>
      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.success === true ? (
        <p className="mt-2 text-sm text-vinho/75">
          Assinatura criada. A fatura mensal chega via Pix — os {String(credits)} créditos entram
          automaticamente após a confirmação.
        </p>
      ) : null}
    </form>
  );
}
