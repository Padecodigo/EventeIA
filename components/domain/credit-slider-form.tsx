"use client";

import { useActionState, useId, useState } from "react";

import {
  applyPackCouponAction,
  buyCreditsAction,
  type CreditsCheckoutState,
} from "@/app/(dashboard)/creditos/actions";
import { CouponToggle } from "@/components/domain/coupon-toggle";
import { OfferBanner } from "@/components/domain/offer-banner";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";
import { Button } from "@/components/ui/button";
import { CUSTOM_CREDITS_MAX, CUSTOM_CREDITS_MIN, quoteCustomCredits } from "@/lib/credit-slider";
import { formatBRL } from "@/lib/money";
import { offerDiscountCents } from "@/lib/offers/pure";

export interface PackOfferProps {
  headline: string;
  remainingMs: number;
  avulsoOffCents: number;
  packPercent: number;
}

const initialState: CreditsCheckoutState = {};

/**
 * Slider de pacote sob medida. O valor exibido é só prévia — o servidor
 * recalcula o preço a partir da quantidade (lib/credit-slider.ts).
 */
export function CreditSliderForm({
  defaultCredits = 7,
  offer = null,
}: {
  defaultCredits?: number;
  offer?: PackOfferProps | null;
}) {
  const [credits, setCredits] = useState(defaultCredits);
  const [coupon, setCoupon] = useState<{
    code: string;
    finalCents: number;
    credits: number;
  } | null>(null);
  const [state, formAction, pending] = useActionState(buyCreditsAction, initialState);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const sliderId = useId();
  const quote = quoteCustomCredits(credits);
  const valueText = `${String(credits)} eventos por ${formatBRL(quote.priceCents)}`;
  const offerOff = offer === null ? 0 : offerDiscountCents(offer, "pack", quote.priceCents);
  // Prévia: o servidor recalcula tudo no pagamento (cupom só vale para a quantidade validada).
  const activeCoupon = coupon !== null && coupon.credits === credits ? coupon : null;
  const previewCents = activeCoupon?.finalCents ?? quote.priceCents - offerOff;

  if (state.card !== undefined) {
    return (
      <div className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-vinho/70">
          Cobrança no cartão gerada — {String(credits)} créditos
        </p>
        <p className="mt-2 text-sm text-vinho/75">
          Conclua com cartão de crédito na página segura do Asaas. Os dados do cartão são digitados
          lá — a EventeIA não os recebe.
        </p>
        <a
          href={state.card.invoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-xl bg-vinho px-5 py-3 text-sm font-medium text-off-white"
        >
          Pagar com cartão
        </a>
        <p className="mt-2 text-caption text-vinho/70">
          Créditos liberados automaticamente após a confirmação.
        </p>
      </div>
    );
  }

  if (state.pix !== undefined) {
    return (
      <div className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-vinho/70">
          Pix gerado — {String(credits)} créditos
        </p>
        <textarea
          readOnly
          value={state.pix.payload}
          rows={4}
          aria-label={`Pix do pacote de ${String(credits)} créditos`}
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
    <div className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      {offer !== null ? (
        <div className="mb-4">
          <OfferBanner
            headline={offer.headline}
            remainingMs={offer.remainingMs}
            detail={`Neste pacote: ${formatBRL(quote.priceCents - offerOff)} em vez de ${formatBRL(quote.priceCents)}`}
          />
        </div>
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="credits" value={credits} />
        {activeCoupon !== null ? (
          <input type="hidden" name="coupon" value={activeCoupon.code} />
        ) : null}
        <label htmlFor={sliderId} className="font-serif text-title-2">
          Quantos eventos você precisa?
        </label>
        <div className="mt-4 flex items-baseline justify-between gap-4" aria-live="polite">
          <p className="font-serif text-title-1 tabular-nums">
            {String(credits)} <span className="text-base">eventos</span>
          </p>
          <p className="font-serif text-title-1 tabular-nums">
            {previewCents < quote.priceCents ? (
              <>
                <s className="mr-2 text-base text-vinho/60">{formatBRL(quote.priceCents)}</s>
                {formatBRL(previewCents)}
              </>
            ) : (
              formatBRL(quote.priceCents)
            )}
          </p>
        </div>
        <input
          id={sliderId}
          type="range"
          min={CUSTOM_CREDITS_MIN}
          max={CUSTOM_CREDITS_MAX}
          step={1}
          value={credits}
          onChange={(e) => setCredits(Number(e.target.value))}
          aria-valuemin={CUSTOM_CREDITS_MIN}
          aria-valuemax={CUSTOM_CREDITS_MAX}
          aria-valuenow={credits}
          aria-valuetext={valueText}
          className="mt-4 h-11 w-full cursor-pointer touch-pan-y accent-vinho"
        />
        <div className="flex justify-between text-caption text-vinho/70" aria-hidden="true">
          <span>{String(CUSTOM_CREDITS_MIN)}</span>
          <span>{String(CUSTOM_CREDITS_MAX)}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-vinho/80">
          <div>
            <dt className="text-caption text-vinho/70">Por evento</dt>
            <dd className="tabular-nums">{formatBRL(quote.perEventCents)}</dd>
          </div>
          <div>
            <dt className="text-caption text-vinho/70">Economia vs. avulso (R$ 97)</dt>
            <dd className="tabular-nums">{formatBRL(quote.savingsCents)}</dd>
          </div>
        </dl>
        <p className="mt-5 text-caption text-vinho/70">
          {`Comprar ${String(credits)} por ${formatBRL(previewCents)}`} — Pix ou cartão de crédito.
        </p>
        <TermsCheckbox
          id="terms-slider"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          className="mt-3"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button type="submit" name="method" value="pix" disabled={pending || !acceptedTerms}>
            {pending ? "Gerando cobrança…" : "Pagar com Pix"}
          </Button>
          <Button
            type="submit"
            name="method"
            value="card"
            variant="secondary"
            disabled={pending || !acceptedTerms}
          >
            Cartão de crédito
          </Button>
        </div>
        {state.error !== undefined ? (
          <p role="alert" className="mt-2 text-sm text-semantic-error">
            {state.error}
          </p>
        ) : null}
      </form>
      <CouponToggle
        action={applyPackCouponAction}
        extra={{ credits: String(credits) }}
        idPrefix="slider"
        onApplied={(code, preview) =>
          setCoupon(
            code !== null && preview?.finalCents !== undefined
              ? { code, finalCents: preview.finalCents, credits }
              : null,
          )
        }
      />
    </div>
  );
}
