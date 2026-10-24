"use client";

import { useActionState } from "react";

import { buyCreditsAction, type CreditsCheckoutState } from "@/app/(dashboard)/creditos/actions";
import { Button } from "@/components/ui/button";

const initialState: CreditsCheckoutState = {};

export interface CreditPackageFormProps {
  code: string;
  name: string;
  credits: number;
  priceFormatted: string;
}

export function CreditPackageForm({ code, name, credits, priceFormatted }: CreditPackageFormProps) {
  const [state, formAction, pending] = useActionState(buyCreditsAction, initialState);

  if (state.pix !== undefined) {
    return (
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-vinho/70">
          Pix gerado — {name}
        </p>
        <textarea
          readOnly
          value={state.pix.payload}
          rows={4}
          aria-label={`Pix do ${name}`}
          className="mt-2 w-full resize-none break-all rounded-lg border border-line-subtle bg-areia-quente p-3 font-mono text-xs text-vinho"
        />
        {state.pix.invoiceUrl !== undefined ? (
          <a
            href={state.pix.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
          >
            Abrir fatura
          </a>
        ) : null}
        <p className="mt-2 text-caption text-vinho/70">
          Créditos liberados automaticamente após a confirmação.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="packageCode" value={code} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Gerando Pix…" : `Comprar ${credits} por ${priceFormatted}`}
      </Button>
      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
