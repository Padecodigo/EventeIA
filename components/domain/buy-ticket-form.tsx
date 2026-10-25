"use client";

import { useActionState, useState } from "react";

import {
  applyCouponAction,
  buyTicketAction,
  type CheckoutState,
  type CouponCheckState,
} from "@/app/(dashboard)/eventos/actions";
import { CouponToggle, type CouponPreviewState } from "@/components/domain/coupon-toggle";
import { WelcomeCountdown } from "@/components/domain/welcome-countdown";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";

const initialCheckout: CheckoutState = {};

export interface BuyTicketFormProps {
  eventId: string;
  priceFormatted: string;
  defaultCpf: string;
  /** Oferta de boas-vindas ativa (aplicada e revalidada no servidor ao gerar o Pix). */
  welcome?: {
    remainingMs: number;
    fullCents: number;
    finalCents: number;
    label?: string;
    /** Oferta pessoal (0036): contagem dd:hh:mm:ss. */
    countdownFormat?: "hms" | "dhms";
  } | null;
}

export function BuyTicketForm({
  eventId,
  priceFormatted,
  defaultCpf,
  welcome = null,
}: BuyTicketFormProps) {
  const [couponState, setCouponState] = useState<CouponCheckState>({});
  const [state, formAction, pending] = useActionState(buyTicketAction, initialCheckout);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const couponApplied = couponState.ok === true;
  const onApplied = (code: string | null, preview: CouponPreviewState | null): void => {
    setCouponState(code !== null && preview !== null ? { ...preview, ok: true, code } : {});
  };

  if (state.courtesy !== undefined) {
    return (
      <section className="rounded-card border border-champagne/50 bg-off-white p-6 shadow-soft">
        <h2 className="font-serif text-title-1">Cortesia aplicada — evento liberado.</h2>
        <p className="mt-2 text-sm text-vinho/70">
          Cupom <strong className="text-vinho">{state.applied?.code}</strong>: total{" "}
          <strong className="text-vinho">{formatBRL(0)}</strong>. Nenhuma cobrança foi gerada.
        </p>
      </section>
    );
  }

  if (state.card !== undefined) {
    return (
      <section className="rounded-card border border-champagne/50 bg-off-white p-6 shadow-soft">
        <h2 className="font-serif text-title-1">Cobrança no cartão gerada.</h2>

        {state.applied !== undefined ? (
          <p className="mt-2 text-sm text-vinho/75">
            Cupom <strong className="text-vinho">{state.applied.code}</strong> aplicado — desconto
            de {formatBRL(state.applied.discountCents)}. Total:{" "}
            <strong className="text-vinho">{formatBRL(state.applied.finalCents)}</strong>.
          </p>
        ) : null}

        <p className="mt-2 text-sm text-vinho/70">
          Conclua o pagamento com cartão de crédito na página segura do Asaas. Os dados do cartão
          são digitados lá — a EventeIA não os recebe.
        </p>

        <a
          href={state.card.invoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-xl bg-vinho px-5 py-3 text-sm font-medium text-off-white"
        >
          Pagar com cartão
        </a>

        <p className="mt-4 text-caption text-vinho/70">
          A confirmação chega automaticamente — esta página será atualizada.
        </p>
      </section>
    );
  }

  if (state.pix !== undefined) {
    return (
      <section className="rounded-card border border-champagne/50 bg-off-white p-6 shadow-soft">
        <h2 className="font-serif text-title-1">Pix gerado.</h2>

        {state.applied !== undefined ? (
          <p className="mt-2 text-sm text-vinho/75">
            Cupom <strong className="text-vinho">{state.applied.code}</strong> aplicado — desconto
            de {formatBRL(state.applied.discountCents)}. Total:{" "}
            <strong className="text-vinho">{formatBRL(state.applied.finalCents)}</strong>.
          </p>
        ) : null}

        <p className="mt-2 text-sm text-vinho/70">
          Finalize o pagamento para liberar o orçamento completo. O Pix expira em até 30 minutos.
        </p>

        <div className="mt-4 rounded-xl border border-line-subtle bg-areia-quente p-4">
          <p className="text-overline uppercase tracking-[0.12em] text-vinho/70">
            Pix copia e cola
          </p>
          <textarea
            readOnly
            value={state.pix.payload}
            rows={4}
            className="mt-2 w-full resize-none break-all rounded-lg border border-line-subtle bg-off-white p-3 font-mono text-xs text-vinho"
          />
        </div>

        {state.pix.invoiceUrl !== undefined ? (
          <a
            href={state.pix.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
          >
            Abrir página de pagamento
          </a>
        ) : null}

        <p className="mt-4 text-caption text-vinho/70">
          A confirmação chega automaticamente — esta página será atualizada.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Liberar este evento</h2>
      <p className="mt-2 text-sm text-vinho/70">
        Tíquete único de <strong className="text-vinho">{priceFormatted}</strong> — pagamento via
        Pix ou cartão de crédito. Inclui orçamento completo, cotações ilimitadas e disparos pelo
        WhatsApp.
      </p>

      {welcome !== null && !couponApplied ? (
        <div role="status" className="mt-5 rounded-xl bg-vinho px-4 py-3 text-sm text-off-white">
          <p>
            {welcome.label ?? "Oferta de boas-vindas aplicada"}:{" "}
            <s className="opacity-80">{formatBRL(welcome.fullCents)}</s>{" "}
            <strong className="text-champagne">{formatBRL(welcome.finalCents)}</strong> · economia
            de {formatBRL(welcome.fullCents - welcome.finalCents)}
          </p>
          <p className="mt-1">
            {welcome.countdownFormat === "dhms" ? "Termina em" : "Expira em"}{" "}
            <WelcomeCountdown
              remainingMs={welcome.remainingMs}
              format={welcome.countdownFormat ?? "hms"}
              className="text-champagne"
            />
          </p>
        </div>
      ) : null}

      {/* Cupom — feedback imediato antes de gerar o Pix (spec §3) */}
      <CouponToggle action={applyCouponAction} onApplied={onApplied} idPrefix="ticket" />

      <form action={formAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="eventId" value={eventId} />
        {couponApplied && couponState.code !== undefined ? (
          <input type="hidden" name="coupon" value={couponState.code} />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cpf" className="text-sm font-medium text-vinho">
            CPF do titular
          </label>
          <input
            id="cpf"
            name="cpf"
            required
            inputMode="numeric"
            autoComplete="off"
            defaultValue={defaultCpf}
            placeholder="00000000000"
            className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
          />
          <p className="text-caption text-vinho/70">
            Usado apenas para emissão da cobrança. Não aparece em orçamentos.
          </p>
        </div>

        <TermsCheckbox id="terms-ticket" checked={acceptedTerms} onChange={setAcceptedTerms} />

        {state.error !== undefined ? (
          <p
            role="alert"
            className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {state.error}
          </p>
        ) : null}

        {couponApplied && couponState.finalCents === 0 ? (
          <Button type="submit" variant="gold" disabled={pending || !acceptedTerms}>
            {pending ? "Ativando…" : "Ativar evento com cortesia"}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              name="method"
              value="pix"
              variant="gold"
              disabled={pending || !acceptedTerms}
            >
              {pending ? "Gerando cobrança…" : "Pagar com Pix"}
            </Button>
            <Button
              type="submit"
              name="method"
              value="card"
              variant="secondary"
              disabled={pending || !acceptedTerms}
            >
              Pagar com cartão de crédito
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
