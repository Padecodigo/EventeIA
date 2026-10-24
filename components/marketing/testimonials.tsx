import type { TestimonialCardData } from "@/lib/testimonials/pure";

/**
 * Depoimentos do conceito editorial.
 *
 * Personas abaixo são o FALLBACK ilustrativo. Quando houver depoimentos reais
 * publicados (fluxo /depoimento + moderação), a página passa os dados reais e a
 * nota de rodapé desaparece automaticamente. Regras: .context/DESIGN_SYSTEM.md §10.
 */
export type Testimonial = TestimonialCardData;

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    id: "camila",
    initials: "CR",
    name: "Camila Rezende",
    context: "Mãe da Lia · Festa de 5 anos · 60 convidados",
    city: "São José dos Campos, SP",
    quote:
      "Queria a festa da Lia do jeito que ela sonhou — e que coubesse no nosso orçamento. Em dois dias, três propostas comparáveis na tela; escolhi com calma e sem susto.",
    outcome: "R$ 2.800 abaixo do primeiro orçamento",
    tone: "champagne",
  },
  {
    id: "marina",
    initials: "MA",
    name: "Marina Alves",
    context: "Mãe do Theo · Festa de 1 aninho",
    city: "Taubaté, SP",
    quote:
      "Trabalho fora e não tinha tempo de ligar para fornecedor. A EventeIA falou com eles por mim e devolveu tudo organizado: buffet, decoração e fotografia.",
    outcome: "4 propostas em 48 horas",
    tone: "vinho",
  },
  {
    id: "debora",
    initials: "DN",
    name: "Débora Nunes",
    context: "Cerimonialista de festas infantis · franquia de créditos",
    city: "São Paulo, SP",
    quote:
      "Com a franquia de créditos eu atendo mais famílias sem perder a curadoria. O orçamento chega pronto; eu ajusto o que é meu e cuido da experiência.",
    outcome: "+6 festas por mês",
    tone: "champagne",
  },
  {
    id: "patricia",
    initials: "PG",
    name: "Patrícia Gomes",
    context: "Mãe de gêmeos · Festa de 7 anos",
    city: "Jacareí, SP",
    quote:
      "Comparar buffet e decoração no mesmo lugar mudou tudo. Consegui negociar com calma e ainda sobrou orçamento para a recreação.",
    outcome: "R$ 1.900 economizados",
    tone: "areia",
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
      <p className="font-serif text-[1.35rem] leading-snug text-vinho">
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
            Festas de tamanhos e orçamentos diferentes. A mesma clareza para decidir.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {list.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>

      </div>
    </section>
  );
}

export const PLANNER_TESTIMONIAL = TESTIMONIALS.find((item) => item.id === "debora");
