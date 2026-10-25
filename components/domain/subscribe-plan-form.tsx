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
      <fieldset className="mb-3">
        <legend className="text-sm font-medium text-vinho">
          Renovar automaticamente todo mês?
        </legend>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="radio" name="renew" value="yes" required /> Sim, renovar todo mês
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="renew" value="no" required /> Não, compra única
        </label>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Button type="submit" name="method" value="pix" variant="primary" disabled={pending}>
          {pending ? "Gerando cobrança…" : `${planName} com Pix (${priceFormatted})`}
        </Button>
        <Button type="submit" name="method" value="card" variant="secondary" disabled={pending}>
          {`${planName} com cartão de crédito`}
        </Button>
      </div>
      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.success === true ? (
        <p className="mt-2 text-sm text-vinho/75">
          Renovação automática ativada. A cada pagamento confirmado, os {String(credits)} créditos
          entram automaticamente.{" "}
          {state.invoiceUrl !== undefined ? (
            <a href={state.invoiceUrl} target="_blank" rel="noreferrer" className="underline">
              Pagar a primeira fatura
            </a>
          ) : null}
        </p>
      ) : null}
      {state.card !== undefined ? (
        <p className="mt-2 text-sm text-vinho/75">
          <a href={state.card.invoiceUrl} target="_blank" rel="noreferrer" className="underline">
            Concluir com cartão de crédito na página segura do Asaas
          </a>
          . Os {String(credits)} créditos entram após a confirmação.
        </p>
      ) : null}
      {state.pix !== undefined ? (
        <div className="mt-2 text-sm text-vinho/75">
          <p>Pix copia-e-cola (compra única):</p>
          <code className="block break-all text-xs">{state.pix.payload}</code>
        </div>
      ) : null}
    </form>
  );
}
