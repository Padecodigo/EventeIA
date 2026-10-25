import type { TestimonialCardData } from "@/lib/testimonials/pure";

/**
 * ⚠️ CONTEÚDO DE EXEMPLO — substituir por depoimentos reais.
 *
 * As personas abaixo são ILUSTRATIVAS (nomes fictícios, sem números inventados).
 * Quando houver depoimentos reais publicados (fluxo /depoimento + moderação), a
 * página passa os dados reais e estas personas deixam de aparecer.
 * NÃO publicar em produção com estes exemplos.
 */
export type Testimonial = TestimonialCardData;

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    id: "camila",
    initials: "CR",
    name: "Camila R.",
    context: "Mãe da Lia · Festa de 5 anos",
    city: "São José dos Campos, SP",
    quote:
      "No dia, eu só chorei de emoção vendo a Lia apagar as velinhas. Pela primeira vez não passei a festa resolvendo problema — passei abraçando quem eu amo.",
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
      "Eu tinha medo de errar num dia tão sonhado. Recebi tudo explicado com carinho e escolhi tranquila. Ver a Sofia dançando a valsa não teve preço.",
    outcome: "",
    tone: "vinho",
  },
  {
    id: "rafael",
    initials: "RS",
    name: "Rafael S.",
    context: "Confraternização corporativa",
    city: "Jacareí, SP",
    quote:
      "Queria que a equipe se sentisse valorizada no fim de ano. Resolvi tudo sem estresse e ainda curti a festa junto com o pessoal.",
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
      "Ganhei tempo para o que eu amo: cuidar de cada família. Os orçamentos chegam organizados e eu foco nos detalhes que emocionam.",
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
    <article className="flex h-full flex-col rounded-3xl border border-champagne-claro bg-white p-7 shadow-[0_20px_50px_-30px_rgba(163,72,90,0.35)]">
      <p role="img" aria-label="5 de 5 estrelas" className="mb-3 tracking-[0.2em] text-amber-400">★★★★★</p>
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
    <section className="bg-gradient-to-b from-[#FBF6F2] to-[#FFF6F1] py-20 lg:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <p className="eyebrow">Histórias que emocionam</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]">
            Quem viveu, conta como foi.
          </h2>
          <p className="max-w-sm text-sm leading-6 text-vinho/75">
            Festa infantil, 15 anos, formatura, casamento ou corporativo: cada história merece ser vivida com calma.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {list.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>

      </div>
    </section>
  );
}

export const PLANNER_TESTIMONIAL = TESTIMONIALS.find((item) => item.id === "debora");
