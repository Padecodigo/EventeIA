import Link from "next/link";

import { WelcomePlanosNote } from "@/components/marketing/welcome-offer";
import { formatBRL } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { calculatePlanEconomics } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo/site";

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

export const metadata = pageMetadata({
  title: "Planos e preços",
  description:
    "Preços da EventeIA: ticket avulso por evento ou planos mensais com créditos para planners. Pix ou cartão, sem fidelidade.",
  path: "/planos",
  keywords: ["preço orçamento de festa", "planos para cerimonialistas"],
});

export default function PlansPage() {
  return (
    <div className="bg-[#2A1119]">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">Planos</p>
      <h1 className="mt-3 max-w-prose font-serif text-display-2 font-display text-off-white">
        Planos para festas de todos os tamanhos.
      </h1>
      <p className="mt-4 max-w-prose text-off-white/85">
        Anfitriões pagam por evento, sem mensalidade. Cada crédito equivale a um evento ativado.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        {/* B2C */}
        <article className="flex flex-col rounded-card border border-line-subtle bg-off-white p-8 shadow-soft">
          <p className="eyebrow">Anfitriões</p>
          <h2 className="mt-3 font-serif text-title-1">Tíquete por evento</h2>
          <p className="mt-6 font-serif text-display-2">{formatBRL(ticketPriceCents)}</p>
          <p className="text-caption text-vinho/75">pagamento único, por evento</p>
          <WelcomePlanosNote />
          <ul className="mt-6 flex-1 space-y-2 text-sm text-vinho/75">
            <li>Sem assinatura e sem renovação automática</li>
            <li>Orçamento completo e explicado</li>
            <li>Cotações ilimitadas do evento</li>
            <li>Contato com fornecedores pelas redes sociais</li>
            <li>Acesso permanente ao evento</li>
          </ul>
          <Link
            prefetch={false}
            href="/registrar"
            className="mt-8 rounded-full bg-primaria px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-primaria-escura"
          >
            Começar
          </Link>
        </article>

        {/* B2B */}
        {PLANS.map((plan) => {
          const perCreditCents = calculatePlanEconomics(
            plan.priceCents,
            plan.credits,
            "pix",
          ).revenuePerCreditCents;

          return (
            <article
              key={plan.code}
              className={
                plan.featured
                  ? "flex flex-col rounded-card bg-white p-8 shadow-raised ring-2 ring-primaria"
                  : "flex flex-col rounded-card border border-line-subtle bg-off-white p-8 shadow-soft"
              }
            >
              <p
                className={
                  plan.featured
                    ? "w-fit rounded-full bg-champagne-claro px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primaria-escura"
                    : "text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70"
                }
              >
                {plan.featured ? "✦ Mais escolhido" : "Planners"}
              </p>
              <h2 className="mt-3 font-serif text-title-1">{plan.name}</h2>
              <p className="mt-6 font-serif text-display-2">{formatBRL(plan.priceCents)}</p>
              <p className="text-caption opacity-70">por mês</p>
              <p className="mt-4 text-sm font-medium">{plan.credits} créditos/mês</p>
              <p className="text-caption opacity-70">≈ {formatBRL(perCreditCents)} por evento</p>
              <p className="mt-2 flex-1 text-sm opacity-75">{plan.description}</p>
              <Link
                prefetch={false}
                href="/registrar"
                className={
                  plan.featured
                    ? "mt-8 rounded-full bg-primaria px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-primaria-escura"
                    : "mt-8 rounded-full border border-champagne px-5 py-3 text-center text-sm font-medium text-vinho transition hover:bg-champagne-claro/40"
                }
              >
                Assinar {plan.name}
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <p className="text-caption text-off-white/80">
          Seus créditos não expiram: use quando quiser.
        </p>
        <Link
          prefetch={false}
          href="/para-planners"
          className="text-sm font-medium text-champagne underline decoration-champagne/50 underline-offset-8"
        >
          Entender o plano de planners
        </Link>
      </div>
      </div>
    </div>
  );
}
