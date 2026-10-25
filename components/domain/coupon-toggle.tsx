"use client";

import { useActionState, useEffect, useState } from "react";

import { requestOfferAction, type RequestOfferState } from "@/app/actions/offers";
import { WelcomeCountdown } from "@/components/domain/welcome-countdown";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";

export interface CouponPreviewState {
  error?: string;
  ok?: boolean;
  code?: string;
  discountCents?: number;
  finalCents?: number;
  offerWins?: boolean;
}

export interface CouponToggleProps {
  /** Server action de prévia (valida no servidor com a mesma regra do checkout). */
  action: (previous: CouponPreviewState, formData: FormData) => Promise<CouponPreviewState>;
  /** Campos extras enviados na prévia (ex.: credits, planCode). */
  extra?: Record<string, string>;
  /** Avisa o pai do código aplicado (vai como `coupon` no checkout) ou null. */
  onApplied: (code: string | null, preview: CouponPreviewState | null) => void;
  idPrefix: string;
}

const initialPreview: CouponPreviewState = {};
const initialOffer: RequestOfferState = {};

/** "Tem um cupom?" (campo expansível + aplicar) e "Quer cupom?" (cupom pessoal). */
export function CouponToggle({ action, extra = {}, onApplied, idPrefix }: CouponToggleProps) {
  const [open, setOpen] = useState(false);
  const [preview, apply, checking] = useActionState(action, initialPreview);
  const [offerState, requestOffer, requesting] = useActionState(requestOfferAction, initialOffer);

  useEffect(() => {
    if (preview.ok === true && preview.code !== undefined && preview.offerWins !== true) {
      onApplied(preview.code, preview);
    } else {
      onApplied(null, preview.ok === true ? preview : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const inputId = `${idPrefix}-coupon`;
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${inputId}-panel`}
          onClick={() => setOpen((v) => !v)}
          className="font-medium text-vinho underline decoration-champagne underline-offset-4"
        >
          Tem um cupom?
        </button>
        <form action={requestOffer}>
          <button
            type="submit"
            disabled={requesting}
            className="font-medium text-vinho underline decoration-champagne underline-offset-4 disabled:opacity-50"
          >
            {requesting ? "Gerando…" : "Quer cupom?"}
          </button>
        </form>
      </div>

      {offerState.offer !== undefined ? (
        <p
          role="status"
          className="rounded-lg bg-semantic-success/10 px-3 py-2 text-semantic-success"
        >
          {offerState.offer.isNew ? "Cupom liberado" : "Você já tem um cupom ativo"}:{" "}
          <strong>{offerState.offer.code}</strong> — {offerState.offer.headline}. Termina em{" "}
          <WelcomeCountdown remainingMs={offerState.offer.remainingMs} format="dhms" />. Já é
          aplicado automaticamente no pagamento.
        </p>
      ) : null}
      {offerState.cooldownUntil !== undefined ? (
        <p role="status" className="text-vinho/75">
          Você já recebeu um cupom recentemente. O próximo fica disponível em{" "}
          {new Date(offerState.cooldownUntil).toLocaleDateString("pt-BR")}.
        </p>
      ) : null}
      {offerState.error !== undefined ? (
        <p role="alert" className="text-semantic-error">
          {offerState.error}
        </p>
      ) : null}

      {open ? (
        <form
          id={`${inputId}-panel`}
          action={apply}
          className="rounded-xl border border-line-subtle bg-areia-quente p-4"
        >
          {Object.entries(extra).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label htmlFor={inputId} className="font-medium text-vinho">
            Código do cupom
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              name="code"
              autoComplete="off"
              placeholder="BEMVINDA10"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line-subtle bg-off-white px-4 uppercase text-vinho"
            />
            <Button type="submit" variant="secondary" disabled={checking} className="h-11">
              {checking ? "Verificando…" : "Aplicar cupom"}
            </Button>
          </div>
          {preview.ok === true && preview.offerWins === true ? (
            <p role="status" className="mt-2 text-vinho/80">
              Sua oferta pessoal dá mais desconto que este cupom — vale o maior (não acumula).
              Total: <strong>{formatBRL(preview.finalCents ?? 0)}</strong>.
            </p>
          ) : null}
          {preview.ok === true && preview.offerWins !== true ? (
            <p
              role="status"
              className="mt-2 rounded-lg bg-semantic-success/10 px-3 py-2 text-semantic-success"
            >
              Cupom <strong>{preview.code}</strong> aplicado — desconto de{" "}
              {formatBRL(preview.discountCents ?? 0)}. Total:{" "}
              <strong>{formatBRL(preview.finalCents ?? 0)}</strong>.
            </p>
          ) : null}
          {preview.error !== undefined ? (
            <p role="alert" className="mt-2 text-semantic-error">
              {preview.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
