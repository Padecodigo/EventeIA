"use client";

import { useActionState, useState } from "react";

import {
  applyPackCouponAction,
  subscribeToPlanAction,
  type SubscribeState,
} from "@/app/(dashboard)/creditos/actions";
import { CouponToggle } from "@/components/domain/coupon-toggle";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";

const initialState: SubscribeState = {};

export interface SubscribePlanFormProps {
  planCode: string;
  planName: string;
  credits: number;
  priceFormatted: string;
  /** Prévia do 1º mês com a oferta pessoal ativa (o servidor recalcula). */
  firstMonthCents?: number | null;
}

export function SubscribePlanForm({
  planCode,
  planName,
  credits,
  priceFormatted,
  firstMonthCents = null,
}: SubscribePlanFormProps) {
  const [state, formAction, pending] = useActionState(subscribeToPlanAction, initialState);
  const [coupon, setCoupon] = useState<{ code: string; finalCents: number } | null>(null);
  const firstMonth = coupon?.finalCents ?? firstMonthCents;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="planCode" value={planCode} />
        {coupon !== null ? <input type="hidden" name="coupon" value={coupon.code} /> : null}
        {firstMonth !== null && state.success !== true ? (
          <p className="mb-2 text-caption text-vinho/80">
            1º pagamento por <strong>{formatBRL(firstMonth)}</strong>; depois {priceFormatted}/mês.
          </p>
        ) : null}
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
            entram automaticamente.
            {state.applied !== undefined
              ? ` Desconto de ${formatBRL(state.applied.discountCents)} (${state.applied.code}) aplicado só na 1ª fatura: ${formatBRL(state.applied.finalCents)}.`
              : ""}{" "}
            {state.invoiceUrl !== undefined ? (
              <a href={state.invoiceUrl} target="_blank" rel="noreferrer" className="underline">
                Pagar a primeira fatura
              </a>
            ) : null}
          </p>
        ) : null}
        {state.notice !== undefined ? (
          <p role="status" className="mt-2 text-sm text-vinho/75">
            {state.notice}
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
      {state.success !== true && state.pix === undefined && state.card === undefined ? (
        <CouponToggle
          action={applyPackCouponAction}
          extra={{ planCode }}
          idPrefix={`plan-${planCode}`}
          onApplied={(code, preview) =>
            setCoupon(
              code !== null && preview?.finalCents !== undefined
                ? { code, finalCents: preview.finalCents }
                : null,
            )
          }
        />
      ) : null}
    </div>
  );
}
