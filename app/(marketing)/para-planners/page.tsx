import Image from "next/image";
import Link from "next/link";

import {
  PLANNER_TESTIMONIAL,
  TestimonialCard,
} from "@/components/marketing/testimonials";
import { formatBRL } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { calculatePlanEconomics } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo/site";
import { getPublishedTestimonials } from "@/lib/testimonials";

const BENEFITS = [
  {
    title: "Franquia que acompanha o ciclo",
    text: "Créditos mensais para as festas dos seus clientes. Top-ups avulsos quando o mês pede mais.",
  },
  {
    title: "Orçamento pronto para a curadoria",
    text: "Chega organizado por categoria; você ajusta o que é seu e mantém o padrão do seu ateliê.",
  },
  {
    title: "Menos tempo cobrando orçamento",
    text: "A prospecção e o contato com fornecedores ficam com a EventeIA. Você fica com a experiência.",
  },
  {
    title: "Histórico e controle por workspace",
    text: "Cada evento com o seu registro, cada crédito com o seu lançamento auditável.",
  },
];

export const metadata = pageMetadata({
  title: "Para planners e cerimonialistas",
  description:
    "Cerimonialistas e decoradores do Vale do Paraíba cotam buffet, decoração, som e foto de vários eventos ao mesmo tempo com a EventeIA.",
  path: "/para-planners",
  keywords: ["cerimonialista", "assessoria de eventos", "planner de festas"],
});

export const revalidate = 60;

export default async function ParaPlannersPage() {
  const realPlannerTestimonials = await getPublishedTestimonials("b2b");
  const featuredTestimonial = realPlannerTestimonials[0] ?? PLANNER_TESTIMONIAL;
  return (
    <>
      <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
        <div>
          <p className="eyebrow">Para planners e cerimonialistas</p>
          <h1 className="mt-5 font-serif text-[clamp(2.4rem,5vw,4.4rem)] font-display leading-[1.02] tracking-[-0.03em] text-vinho">
            Mais tempo para a sua curadoria.{" "}
            <em className="italic">Menos tempo cobrando orçamento.</em>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-vinho/70">
            A EventeIA amplia sua capacidade de prospecção: encontra fornecedores, coleta propostas e
            entrega tudo organizado para você cuidar da experiência — em festas infantis e em todos
            os eventos que você assina.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link prefetch={false}
              href="/registrar"
              className="rounded-full bg-primaria px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-primaria-escura"
            >
              Quero conhecer <span aria-hidden="true">↗</span>
            </Link>
            <Link prefetch={false}
              href="/planos"
              className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-8"
            >
              Ver planos de créditos
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[2rem] border border-line-subtle bg-off-white p-2 shadow-raised">
            <Image
              src="/EventeIA-planner.png"
              alt="Planner organizando referências de mesa e convite sobre a mesa de trabalho"
              width={768}
              height={1376}
              className="aspect-[.9] w-full rounded-[1.5rem] object-cover"
              sizes="(max-width: 1024px) 100vw, 480px"
            />
          </div>
          <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-champagne/40 bg-vinho/95 p-4 text-off-white backdrop-blur">
            <p className="font-serif text-lg">A festa é sua. A organização é nossa.</p>
            <p className="mt-1 text-xs text-off-white/70">
              Você cuida do sonho. A EventeIA cuida de encontrar o caminho.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-line-subtle bg-off-white py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <p className="eyebrow">O que muda na sua rotina</p>
          <h2 className="mt-3 max-w-2xl font-serif text-display-2 font-display leading-tight">
            Curadoria no centro. Burocracia nos bastidores.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <article key={benefit.title} className="rounded-card border border-line-subtle bg-areia-quente p-6">
                <h3 className="font-serif text-title-2">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-vinho/75">{benefit.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Franquia de créditos</p>
            <h2 className="mt-3 font-serif text-display-2 font-display leading-tight">
              Planos para o seu ritmo de ateliê.
            </h2>
          </div>
          <Link prefetch={false}
            href="/planos"
            className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-8"
          >
            Comparar planos
          </Link>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
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
                    ? "rounded-card bg-white p-8 shadow-raised ring-2 ring-primaria"
                    : "rounded-card border border-line-subtle bg-off-white p-8 shadow-soft"
                }
              >
                <p className={plan.featured ? "w-fit rounded-full bg-champagne-claro px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primaria-escura" : "text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70"}>
                  {plan.featured ? "✦ Mais escolhido" : "Plano"}
                </p>
                <h3 className="mt-3 font-serif text-title-1">{plan.name}</h3>
                <p className="mt-5 font-serif text-3xl">{formatBRL(plan.priceCents)}</p>
                <p className="text-caption opacity-70">por mês</p>
                <p className="mt-4 text-sm font-medium">{plan.credits} créditos/mês</p>
                <p className="text-caption opacity-70">
                  ≈ {formatBRL(perCreditCents)} por evento
                </p>
                <p className="mt-2 text-sm opacity-75">{plan.description}</p>
                <Link prefetch={false}
                  href="/registrar"
                  className={
                    plan.featured
                      ? "mt-8 inline-flex rounded-full bg-primaria px-5 py-3 text-sm font-semibold text-white transition hover:bg-primaria-escura"
                      : "mt-8 inline-flex rounded-full border border-champagne px-5 py-3 text-sm font-medium text-vinho transition hover:bg-champagne-claro/40"
                  }
                >
                  Assinar {plan.name}
                </Link>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-caption text-vinho/70">
          Valores ilustrativos e configuráveis. O crédito corresponde a um evento ativado; top-ups
          avulsos não expiram.
        </p>
      </section>

      {featuredTestimonial !== undefined ? (
        <section className="border-t border-line-subtle bg-areia-secundaria/40 py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow">Histórias de clareza</p>
              <h2 className="mt-3 font-serif text-display-2 font-display leading-tight">
                “O orçamento chega pronto. Eu ajusto o que é meu.”
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vinho/75">
                Planner há 12 anos, Débora transformou a franquia em capacidade de atendimento sem
                perder a curadoria que é a marca do ateliê dela.
              </p>
              <Link prefetch={false}
                href="/registrar"
                className="mt-8 inline-flex rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-white transition hover:bg-primaria-escura"
              >
                Quero experimentar
              </Link>
            </div>
            <TestimonialCard testimonial={featuredTestimonial} />
          </div>
        </section>
      ) : null}
    </>
  );
}
