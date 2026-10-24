import type { TestimonialCardData } from "@/lib/testimonials/pure";

/**
 * ⚠️ CONTEÚDO DE EXEMPLO — substituir por depoimentos reais.
 *
 * As personas abaixo são ILUSTRATIVAS (nomes fictícios, sem números inventados).
 * Quando houver depoimentos reais publicados (fluxo /depoimento + moderação), a
 * página passa os dados reais e o aviso "exemplos ilustrativos" some sozinho.
 */
export type Testimonial = TestimonialCardData;

export const EXAMPLE_TESTIMONIALS_NOTE =
  "Exemplos ilustrativos de como o serviço funciona — depoimentos reais de clientes da região em breve.";

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    id: "camila",
    initials: "CR",
    name: "Camila R.",
    context: "Mãe da Lia · Festa de 5 anos",
    city: "São José dos Campos, SP",
    quote:
      "Eu não tinha tempo de ligar pra ninguém. Recebi as opções organizadas no celular e escolhi com calma, sabendo exatamente o que estava pagando.",
    outcome: "",
    tone: "champagne",
  },
  {
    id: "marina",
    initials: "MA",
    name: "Marina A.",
    context: "15 anos da Sofia",
    city: "Taubaté, SP",
    quote:
      "Buffet, decoração e foto lado a lado, com as taxas à vista. Pela primeira vez entendi a diferença entre o mais barato e o que valia mais a pena.",
    outcome: "",
    tone: "vinho",
  },
  {
    id: "rafael",
    initials: "RS",
    name: "Rafael S.",
    context: "Confraternização da empresa",
    city: "Jacareí, SP",
    quote:
      "Precisava de espaço e buffet para a equipe sem perder uma semana nisso. Chegaram propostas comparáveis e a decisão ficou fácil de justificar.",
    outcome: "",
    tone: "areia",
  },
  {
    id: "debora",
    initials: "DN",
    name: "Débora N.",
    context: "Cerimonialista · franquia de créditos",
    city: "Caçapava, SP",
    quote:
      "Com os créditos eu atendo mais famílias sem perder a curadoria. O orçamento chega pronto; eu ajusto o que é meu e cuido da experiência.",
    outcome: "",
    tone: "champagne",
  },
];

const toneClasses: Record<Testimonial["tone"], string> = {
  vinho: "bg-vinho text-off-white",
  champagne: "bg-champagne text-vinho",
  areia: "bg-areia-secundaria text-vinho",
};

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <article className="flex h-full flex-col rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <p className="text-body-lg leading-relaxed text-vinho">
        “{testimonial.quote}”
      </p>

      <div className="mt-6 flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${toneClasses[testimonial.tone]}`}
          aria-hidden="true"
        >
          {testimonial.initials}
        </span>
        <div>
          <p className="text-sm font-semibold text-vinho">{testimonial.name}</p>
          <p className="text-caption text-vinho/70">
            {testimonial.city.length > 0 ? `${testimonial.city} · ` : ""}
            {testimonial.context}
          </p>
        </div>
      </div>

      {testimonial.outcome.length > 0 ? (
        <p className="mt-4 inline-flex w-fit rounded-full border border-champagne/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-vinho/70">
          {testimonial.outcome}
        </p>
      ) : null}
    </article>
  );
}

export function Testimonials({ items }: { items?: readonly TestimonialCardData[] }) {
  const hasRealTestimonials = items !== undefined && items.length > 0;
  const list = hasRealTestimonials ? items : TESTIMONIALS;

  return (
    <section className="border-y border-line-subtle bg-areia-secundaria/40 py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <p className="eyebrow">Histórias de clareza</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-2xl font-serif text-display-2 font-display leading-tight">
            Quem viveu, conta como foi.
          </h2>
          <p className="max-w-sm text-sm leading-6 text-vinho/75">
            Festa infantil, 15 anos, empresa ou casamento: a mesma clareza para decidir.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {list.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>

        {hasRealTestimonials ? null : (
          <p className="mt-6 text-caption text-vinho/70">{EXAMPLE_TESTIMONIALS_NOTE}</p>
        )}

      </div>
    </section>
  );
}

export const PLANNER_TESTIMONIAL = TESTIMONIALS.find((item) => item.id === "debora");
