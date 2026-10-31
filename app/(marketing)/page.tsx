import Image from "next/image";
import Link from "next/link";

import { HowItWorksAnimation } from "@/components/marketing/how-it-works-animation";
import { TESTIMONIALS, Testimonials } from "@/components/marketing/testimonials";
import { JsonLd } from "@/components/seo/json-ld";
import { formatBRL } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { buildFaq } from "@/lib/seo/faq";
import { faqLd, graph, localBusinessLd, organizationLd, serviceLd, websiteLd } from "@/lib/seo/jsonld";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/seo/site";
import { getPublishedTestimonials } from "@/lib/testimonials";

export const revalidate = 60;

export const metadata = pageMetadata({
  title: "Fornecedores e orçamento do seu evento, prontos",
  description: SITE_DESCRIPTION,
  path: "/",
  keywords: ["orçamento de festa infantil", "orçamento de casamento", "festa de 15 anos", "formatura"],
});

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

const EVENT_TYPES = [
  { label: "Festa infantil", hint: "Buffet, decoração, bolo, recreação" },
  { label: "Aniversário", hint: "Do bolo ao DJ" },
  { label: "15 anos", hint: "Salão, vestido, fotografia, valsa" },
  { label: "Formatura", hint: "Espaço, buffet, banda, foto" },
  { label: "Casamento", hint: "Cerimônia, recepção, flores" },
  { label: "Corporativo", hint: "Confraternização, convenção, coffee break" },
  { label: "Batizado e chá", hint: "Chá de bebê, revelação, batizado" },
  { label: "Celebrações", hint: "Bodas, despedidas, encontros" },
] as const;

const OPTIONS = [
  { title: "Preço", text: "A combinação mais barata entre as propostas que chegaram, já com taxas incluídas.", dot: "from-terracota to-primaria" },
  { title: "Custo-benefício", text: "O melhor equilíbrio entre valor e qualidade — o que mais vale a pena.", dot: "from-champagne to-champagne" },
  { title: "Comodidade", text: "Menos fornecedores, menos dor de cabeça: pacotes que resolvem mais coisas juntos.", dot: "from-terracota to-primaria" },
] as const;

const STEPS = [
  { n: "1", title: "Conte seu evento", text: "Tipo de festa, data, cidade, número de convidados e o que não pode faltar. Leva poucos minutos." },
  { n: "2", title: "A EventeIA busca e compara", text: "Encontramos fornecedores da sua região, pedimos orçamento a cada um pelas redes sociais e comparamos os preços — taxas escondidas incluídas." },
  { n: "3", title: "Você recebe e escolhe", text: "O orçamento chega pronto, em 3 opções: melhor preço, custo-benefício e comodidade. Você escolhe e só fecha com o seu “sim”." },
] as const;

const TRUST = [
  { title: "Pagamento seguro", text: "Pix seguro ou cartão, com processamento por instituição de pagamento regulada." },
  { title: "Sem spam", text: "Mensagens com intervalo; qualquer fornecedor pode pedir para sair e é respeitado na hora." },
  { title: "Sem spam", text: "O fornecedor nos procura pelas redes sociais; a conversa acontece no canal dele." },
  { title: "Dados protegidos", text: "Usamos seus dados só para cotar o seu evento, conforme a LGPD." },
] as const;

const FAQ = buildFaq(ticketPriceCents);

const sectionTitle = "font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-vinho";

function Stars() {
  return (
    <span role="img" aria-label="5 de 5 estrelas" className="flex gap-0.5 text-amber-400">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default async function LandingPage() {
  const realTestimonials = await getPublishedTestimonials();
  const heroTestimonials = (realTestimonials.length > 0 ? realTestimonials : TESTIMONIALS).slice(0, 1);
  const [mainTestimonial] = heroTestimonials;

  return (
    <>
      {/* ================= HERO (acima da dobra) ================= */}
      <section className="relative isolate overflow-hidden bg-areia-quente">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-[-10%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(215,231,227,0.7),transparent)]" />
          <div className="absolute -left-40 bottom-[-25%] h-[540px] w-[540px] rounded-full bg-[radial-gradient(closest-side,rgba(240,160,112,0.3),transparent)]" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-5 pb-14 pt-8 sm:px-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-20">
          <div className="ev-rise text-vinho">
            <p className="inline-flex items-center gap-2 rounded-full border border-coral/30 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-coral-escuro">
              Para quem está organizando um evento
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.2rem,4.4vw,3.8rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
              Você conta como é seu evento.
              <span className="mt-3 block text-[clamp(1.35rem,2.3vw,2rem)] leading-[1.18] tracking-[-0.015em] text-coral-escuro">A gente encontra os fornecedores, compara os preços e entrega o orçamento pronto.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-vinho/85">
              Casamento, aniversário, 15 anos, formatura ou corporativo<span className="sm:hidden">.</span><span className="hidden sm:inline">: em vez de você ligar para um por um, a EventeIA pede orçamento aos fornecedores da sua região pelas redes sociais, com foco no Vale do Paraíba e em São Paulo, e compara tudo.</span> Você recebe{" "}
              <strong className="font-semibold text-vinho">3 opções prontas</strong> — melhor preço, custo-benefício e
              comodidade — e só escolhe.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <Link
                prefetch={false}
                href="/registrar"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-primaria px-6 py-3.5 text-[15px] font-semibold text-on-primary shadow-[0_10px_30px_-12px_rgba(240,160,112,0.65)] transition hover:bg-primaria-escura active:scale-[0.98]"
              >
                Começar agora
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
              <Link prefetch={false}
                href="#planos"
                className="inline-flex items-center justify-center rounded-full border border-vinho/30 px-6 py-3.5 text-[15px] font-semibold text-vinho transition hover:border-vinho hover:bg-white/70"
              >
                Ver planos e preços
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-vinho/85">
              <span className="inline-flex items-center gap-2 rounded-full border border-vinho/15 bg-white/70 px-3 py-1 font-medium text-vinho">
                Ticket avulso · <strong className="font-bold text-coral-escuro">{formatBRL(ticketPriceCents)}</strong> por evento
              </span>
              <span>Sem mensalidade · Pix seguro ou cartão</span>
            </div>
            <p className="mt-4 text-xs text-vinho/80">
              É fornecedor de eventos?{" "}
              <Link prefetch={false} href="/seja-fornecedor" data-testid="link-fornecedor" className="underline underline-offset-2 hover:text-coral-escuro">
                Veja como receber pedidos de orçamento
              </Link>
            </p>

            {mainTestimonial ? (
              <figure className="mt-8 max-w-lg rounded-3xl border border-line-subtle bg-white p-5 shadow-soft">
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-champagne text-sm font-bold text-on-primary ring-4 ring-champagne-claro"
                  >
                    {initials(mainTestimonial.name)}
                  </span>
                  <div className="min-w-0">
                    <Stars />
                    <blockquote className="mt-2 text-[15px] leading-relaxed text-vinho/85">“{mainTestimonial.quote}”</blockquote>
                    <figcaption className="mt-3 text-sm text-vinho/70">
                      <strong className="font-semibold text-vinho">{mainTestimonial.name}</strong> · {mainTestimonial.context}
                      {mainTestimonial.city.length > 0 ? ` · ${mainTestimonial.city}` : ""}
                    </figcaption>
                  </div>
                </div>
              </figure>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 overflow-hidden rounded-3xl ring-1 ring-vinho/10">
              <Image src="/img/eventos/festa-infantil-velas.jpg" alt="Festa infantil" width={720} height={480} className="h-48 w-full object-cover sm:h-56" priority />
            </div>
            {[
              { src: "/img/eventos/casamento.jpg", label: "Casamento" },
              { src: "/img/eventos/15-anos.jpg", label: "15 anos" },
              { src: "/img/eventos/festa-formatura-baile.jpg", label: "Formatura" },
              { src: "/img/eventos/corporativo.webp", label: "Corporativo" },
            ].map((photo) => (
              <div key={photo.src} className="hidden overflow-hidden rounded-2xl ring-1 ring-vinho/10 sm:block">
                <Image src={photo.src} alt={photo.label} width={360} height={240} className="h-24 w-full object-cover sm:h-28" />
              </div>
            ))}
            <div className="col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-white/70 px-4 py-3">
              <span className="text-sm font-semibold text-vinho">Você recebe 3 opções prontas</span>
              <span className="flex gap-2">
                {OPTIONS.map((o) => (
                  <span key={o.title} className="rounded-full bg-champagne-claro px-2.5 py-0.5 text-[11px] font-semibold text-vinho ring-1 ring-coral/30">
                    {o.title}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="relative border-y border-line-subtle bg-gradient-to-r from-areia-quente via-champagne-claro to-teal-soft py-4 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <ul className="ev-marquee flex w-max gap-10 whitespace-nowrap font-display text-xl italic font-medium text-vinho/80">
            {[...EVENT_TYPES, ...EVENT_TYPES].map((e, i) => (
              <li key={`${e.label}-${i}`} aria-hidden={i >= EVENT_TYPES.length} className="flex items-center gap-10">
                {e.label}
                <span aria-hidden="true" className="text-vinho/30">♥</span>
              </li>
            ))}
          </ul>
        </div>
      </section>


      {/* ================= Como funciona ================= */}
      <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-24 bg-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="eyebrow">Como funciona · 3 passos</p>
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
            <h2 id="como-funciona-titulo" className={`mt-4 max-w-2xl ${sectionTitle}`}>Como funciona para você, que está organizando o evento</h2>
            <HowItWorksAnimation />
          </div>
          <ol className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-3xl p-7 ring-1 ring-champagne-claro bg-areia-quente">
                <span className="font-display text-sm font-bold text-coral-escuro">Passo {s.n}</span>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-vinho">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-vinho/70">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-[15px] text-vinho/70">A EventeIA trabalha para quem contrata: não é uma rede entre fornecedores nem um classificado. Você não precisa procurar ninguém.</p>
          <Link prefetch={false} href="/como-funciona" className="mt-10 inline-flex items-center gap-1 text-sm font-semibold text-vinho hover:text-coral-escuro">
            Ver o passo a passo completo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* ================= Selos de confiança ================= */}
      <section aria-label="Por que confiar" className="bg-white">
        <ul className="mx-auto grid grid-cols-1 w-full max-w-7xl gap-4 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {TRUST.map((item) => (
            <li key={item.title} className="rounded-2xl border border-champagne-claro bg-areia-quente p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(43,39,36,0.3)]">
              <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-primaria shadow-sm ring-1 ring-champagne-claro">
                ✓
              </span>
              <p className="mt-4 text-[15px] font-semibold text-vinho">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-vinho/70">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ================= As 3 opções ================= */}
      <section className="bg-surface-dark">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">O que você recebe</p>
          <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-ink-inverse">Três caminhos claros. Você só escolhe.</h2>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {OPTIONS.map((o, i) => (
              <article
                key={o.title}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-7 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-champagne/30"
              >
                <div aria-hidden="true" className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${o.dot} opacity-10 blur-2xl transition duration-500 group-hover:opacity-25`} />
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${o.dot} text-sm font-bold text-on-primary`}>
                  {i + 1}
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink-inverse">{o.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-inverse/85">{o.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Tipos de evento ================= */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="eyebrow">Para todo tipo de evento</p>
          <h2 className={`mt-4 max-w-2xl ${sectionTitle}`}>Da festinha em casa ao evento corporativo.</h2>
          <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
            {EVENT_TYPES.map((e) => (
              <li
                key={e.label}
                className="group rounded-2xl border border-champagne-claro bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-coral/40 hover:shadow-[0_16px_40px_-20px_rgba(240,160,112,0.35)]"
              >
                <p className="font-display text-base font-bold text-vinho">{e.label}</p>
                <p className="mt-1 text-sm text-vinho/75">{e.hint}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= Planos ================= */}
      <section id="planos" className="relative isolate scroll-mt-24 overflow-hidden bg-surface-dark py-20 text-ink-inverse lg:py-28">
        <div aria-hidden="true" className="absolute left-1/2 top-0 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(240,160,112,0.14),transparent)]" />
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">Planos</p>
          <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-ink-inverse">
            Pague só pelo seu evento. Ou assine, se você organiza vários.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-4">
            <article className="flex flex-col rounded-3xl bg-white p-7 text-vinho shadow-[0_30px_60px_-20px_rgba(240,160,112,0.35)] ring-2 ring-primaria">
              <p className="text-xs font-bold uppercase tracking-wider text-coral-escuro">Ticket avulso</p>
              <h3 className="mt-2 font-display text-xl font-bold">Para o seu evento</h3>
              <p className="mt-5 font-display text-5xl font-semibold tracking-tight">{formatBRL(ticketPriceCents)}</p>
              <p className="mt-1 text-sm text-vinho/75">pagamento único por evento</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-vinho/80">
                <li>✓ Sem mensalidade</li>
                <li>✓ Cotações pelas redes sociais</li>
                <li>✓ 3 opções comparadas</li>
                <li>✓ Pix ou cartão</li>
              </ul>
              <Link prefetch={false} href="/registrar" className="mt-7 inline-flex justify-center rounded-full bg-primaria px-5 py-3 text-sm font-bold text-on-primary transition hover:bg-primaria-escura">
                Começar agora
              </Link>
            </article>

            {PLANS.map((plan) => (
              <article
                key={plan.code}
                className={`flex flex-col rounded-3xl p-7 backdrop-blur transition duration-300 hover:-translate-y-1 ${
                  plan.featured ? "bg-white ring-1 ring-champagne shadow-[0_24px_50px_-30px_rgba(43,39,36,0.45)]" : "bg-off-white ring-1 ring-champagne-claro"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-vinho/70">
                  {plan.featured ? "Planners · mais escolhido" : "Planners"}
                </p>
                <h3 className="mt-2 font-display text-xl font-bold">{plan.name}</h3>
                <p className="mt-5 font-display text-4xl font-semibold tracking-tight">{formatBRL(plan.priceCents)}</p>
                <p className="mt-1 text-sm text-vinho/75">por mês · {plan.credits} eventos</p>
                <p className="mt-5 flex-1 text-sm leading-relaxed text-vinho/75">{plan.description}</p>
                <Link prefetch={false} href="/planos" className="mt-7 inline-flex justify-center rounded-full border border-vinho/15 px-5 py-3 text-sm font-semibold transition hover:bg-white">
                  Ver detalhes
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Testimonials items={realTestimonials.length > 0 ? realTestimonials : undefined} />

      <JsonLd data={graph([organizationLd(), websiteLd(), serviceLd(ticketPriceCents), localBusinessLd(), faqLd(FAQ)])} />

      {/* ================= FAQ ================= */}
      <section id="perguntas" aria-labelledby="faq-titulo" className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
        <p className="eyebrow">Dúvidas frequentes</p>
        <h2 id="faq-titulo" className={`mt-4 ${sectionTitle}`}>Perguntas que a gente sempre ouve</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-champagne-claro bg-white p-5 transition open:shadow-[0_12px_30px_-18px_rgba(43,39,36,0.3)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-vinho">
                {item.q}
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-areia-secundaria text-lg text-vinho transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-vinho/70">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ================= CTA final ================= */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="relative isolate mx-auto w-full max-w-5xl overflow-hidden rounded-[2.5rem] bg-surface-dark px-6 py-16 text-center text-ink-inverse sm:py-20">
          <div aria-hidden="true" className="absolute -top-24 left-1/2 -z-10 h-80 w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(240,160,112,0.35),transparent)]" />
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em]">
            Seu evento merece ser curtido, não administrado.
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-ink-inverse/85">
            Conte o que você imagina. A EventeIA corre atrás dos orçamentos e te mostra as melhores opções.
          </p>
          <Link prefetch={false} href="/registrar" className="group mt-9 inline-flex items-center gap-2 rounded-full bg-champagne px-7 py-3.5 font-semibold text-on-primary transition hover:-translate-y-0.5 hover:bg-champagne-claro">
            Testar agora <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
