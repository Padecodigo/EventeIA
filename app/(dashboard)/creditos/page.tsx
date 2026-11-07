import Link from "next/link";

import { SingleEventOffer } from "@/components/domain/single-event-offer";
import { requireUser } from "@/lib/auth";
import { ticketPriceCents } from "@/lib/seo/pricing";

export const metadata = { title: "Pagamento" };

/**
 * Pagamento do painel: um ticket por evento, sem assinatura.
 * A rota /creditos é mantida para não quebrar links antigos do painel.
 */
export default async function CreditsPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="eyebrow">Pagamento</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Você paga por evento.</h1>
        <p className="mt-2 max-w-2xl text-sm text-vinho/75">
          Sem mensalidade e sem renovação automática. Cada evento é ativado com um ticket único, e
          você só decide fechar com quem quiser.
        </p>
      </section>

      <SingleEventOffer priceCents={ticketPriceCents()} />

      <p className="text-sm text-vinho/70">
        Já tem um evento ativo?{" "}
        <Link prefetch={false} href="/eventos" className="font-medium text-coral-escuro underline decoration-coral-escuro/50 underline-offset-4">
          Ver meus eventos
        </Link>
        .
      </p>
    </div>
  );
}
