"use client";

import { useActionState, useState } from "react";

import {
  buyTicketCreditAction,
  type CreditsCheckoutState,
} from "@/app/(dashboard)/creditos/actions";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";
import { Button } from "@/components/ui/button";

const initialCheckout: CreditsCheckoutState = {};

export interface BuyTicketCreditFormProps {
  priceFormatted: string;
  defaultCpf: string;
}

/**
 * Checkout do ticket AVULSO (sem evento). Reusa a mesma renderização Pix/cartão
 * do checkout por evento, sem `eventId`.
 */
export function BuyTicketCreditForm({ priceFormatted, defaultCpf }: BuyTicketCreditFormProps) {
  const [state, formAction, pending] = useActionState(buyTicketCreditAction, initialCheckout);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  if (state.card !== undefined) {
    return (
      <section className="rounded-card border border-champagne/50 bg-off-white p-6 shadow-soft">
        <h2 className="font-serif text-title-1">Cobrança no cartão gerada.</h2>
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
        <p className="mt-2 text-sm text-vinho/70">
          Finalize o pagamento para guardar o ticket. O Pix expira em até 30 minutos.
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
      <h2 className="font-serif text-title-1">Comprar ticket avulso</h2>
      <p className="mt-2 text-sm text-vinho/70">
        Ticket único de <strong className="text-vinho">{priceFormatted}</strong> — pagamento via
        Pix ou cartão de crédito. Você guarda o ticket e usa quando criar um evento.
      </p>

      <form action={formAction} className="mt-5 flex flex-col gap-4">
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

        <TermsCheckbox id="terms-ticket-credit" checked={acceptedTerms} onChange={setAcceptedTerms} />

        {state.error !== undefined ? (
          <p
            role="alert"
            className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            name="method"
            value="pix"
            variant="gold"
            disabled={pending || !acceptedTerms}
          >
            {pending ? "Gerando cobrança…" : "Comprar com Pix"}
          </Button>
          <Button
            type="submit"
            name="method"
            value="card"
            variant="secondary"
            disabled={pending || !acceptedTerms}
          >
            Comprar com cartão de crédito
          </Button>
        </div>
      </form>
    </section>
  );
}
