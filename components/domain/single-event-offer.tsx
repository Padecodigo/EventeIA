import Link from "next/link";

import { formatBRL } from "@/lib/money";

export interface SingleEventOfferProps {
  priceCents: number;
}

/**
 * Evento avulso no painel logado: mesmo preço/fluxo da página pública de planos.
 * Sempre visível — inclusive para quem já teve evento ou assinatura e volta meses depois.
 */
export function SingleEventOffer({ priceCents }: SingleEventOfferProps) {
  return (
    <section
      aria-labelledby="evento-avulso-title"
      className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft"
    >
      <p className="eyebrow">Evento avulso</p>
      <h2 id="evento-avulso-title" className="mt-2 font-serif text-title-1">
        Só mais um evento? Compre avulso.
      </h2>
      <p className="mt-2 font-serif text-title-1">{formatBRL(priceCents)}</p>
      <p className="mt-1 text-sm text-vinho/75">
        Pagamento único por evento, sem mensalidade. Pix ou cartão de crédito; cupons de desconto
        são aceitos no checkout do evento.
      </p>
      <Link
        href="/eventos#novo-evento"
        className="mt-5 inline-block rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura"
      >
        Criar evento avulso
      </Link>
    </section>
  );
}
