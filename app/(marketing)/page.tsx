import Image from "next/image";
import Link from "next/link";

import { TESTIMONIALS, EXAMPLE_TESTIMONIALS_NOTE, Testimonials } from "@/components/marketing/testimonials";
import { formatBRL } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { getPublishedTestimonials } from "@/lib/testimonials";

export const revalidate = 60;

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

/** Mosaico do hero — festa infantil em destaque, mas todos os tipos de evento presentes. */
const MOSAIC = [
  { src: "/festa-infantil.jpg", alt: "Mesa de festa infantil com arco de balões, bolo e doces", label: "Festa infantil", w: 1280, h: 1075, big: true },
  { src: "/img/eventos/15-anos.jpg", alt: "Debutante com vestido bordado segurando um buquê", label: "15 anos", w: 1000, h: 1250 },
  { src: "/img/eventos/formatura.jpg", alt: "Formandos jogando os capelos para o alto", label: "Formatura", w: 1000, h: 1250 },
  { src: "/festa-aniversario.jpg", alt: "Mesa de aniversário decorada com balões e doces", label: "Aniversário", w: 1280, h: 960 },
  { src: "/EventeIA-wedding.png", alt: "Recepção de casamento à luz de velas", label: "Casamento", w: 1376, h: 768 },
  { src: "/img/eventos/corporativo.jpg", alt: "Auditório cheio em um evento corporativo", label: "Corporativo", w: 1000, h: 1250 },
] as const;

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
  { title: "Preço", text: "A combinação mais barata entre as propostas que chegaram, já com taxas incluídas.", dot: "bg-menta" },
  { title: "Custo-benefício", text: "O melhor equilíbrio entre valor e qualidade — o que mais vale a pena.", dot: "bg-champagne" },
  { title: "Comodidade", text: "Menos fornecedores, menos dor de cabeça: pacotes que resolvem mais coisas juntos.", dot: "bg-lilas" },
] as const;

const STEPS = [
  { n: "1", title: "Conte sobre o evento", text: "Tipo de festa, data, cidade, convidados e o que não pode faltar. Leva poucos minutos." },
  { n: "2", title: "A gente pede os orçamentos", text: "Falamos com fornecedores da sua região pelo WhatsApp, com calma e sem spam." },
  { n: "3", title: "Comparamos tudo", text: "Lemos cada resposta, achamos taxas escondidas e colocamos tudo na mesma régua." },
  { n: "4", title: "Você escolhe", text: "Receba 3 opções — preço, custo-benefício e comodidade — e decida com tranquilidade." },
] as const;

const TRUST = [
  { title: "Pagamento seguro", text: "Pix ou cartão processados pelo Asaas, instituição de pagamento regulada." },
  { title: "Sem spam", text: "Mensagens com intervalo; qualquer fornecedor pode pedir para sair e é respeitado na hora." },
  { title: "Seu WhatsApp protegido", text: "A conexão é usada só durante a busca e encerrada automaticamente no final." },
  { title: "Dados protegidos", text: "Usamos seus dados só para cotar o seu evento, conforme a LGPD." },
] as const;

const FAQ = [
  {
    q: "Para quais eventos a EventeIA funciona?",
    a: "Para todos: festa infantil, aniversário, 15 anos, formatura, casamento, evento corporativo, chá de bebê, batizado e outras celebrações.",
  },
  {
    q: "Como os fornecedores são contatados?",
    a: "Pelo WhatsApp que você conecta ao iniciar a busca. As mensagens saem com intervalo, o fornecedor pode pedir para não receber mais e, ao final da busca, a conexão é encerrada por segurança.",
  },
  {
    q: "Quanto custa?",
    a: `Para quem organiza o próprio evento, um ticket avulso de ${formatBRL(ticketPriceCents)} por evento, sem mensalidade. Cerimonialistas e planners têm planos mensais com créditos.`,
  },
  {
    q: "Sou obrigado a fechar com algum fornecedor?",
    a: "Não. A EventeIA organiza e compara as propostas; quem decide e negocia é você.",
  },
  {
    q: "Como funciona o pagamento?",
    a: "Pix ou cartão, processados com segurança pelo Asaas. Você recebe a confirmação na hora em que o pagamento é aprovado.",
  },
] as const;

const primaryCta =
  "inline-flex items-center justify-center gap-2 rounded-full bg-champagne px-7 py-4 text-base font-bold text-vinho shadow-[0_10px_28px_rgba(255,122,69,0.35)] transition hover:-translate-y-0.5 hover:bg-[#FF8B5C] active:translate-y-0";

export default async function LandingPage() {
  const realTestimonials = await getPublishedTestimonials();
  const heroTestimonials = (realTestimonials.length > 0 ? realTestimonials : TESTIMONIALS).slice(0, 2);
  const heroIsExample = realTestimonials.length === 0;

  return (
    <>
      {/* ================= HERO (acima da dobra) ================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-champagne-claro/60 via-areia-quente to-areia-quente">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sol/30 blur-3xl"
        />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-14">
          <div>
            <p className="eyebrow">Festa infantil · 15 anos · Formatura · Casamento · Empresa</p>
            <h1 className="mt-4 font-serif text-[clamp(2.2rem,5.2vw,3.9rem)] font-display leading-[1.05] tracking-[-0.02em] text-vinho">
              Orçamentos do seu evento,{" "}
              <span className="relative whitespace-nowrap">
                sem ligar pra ninguém
                <span aria-hidden="true" className="absolute -bottom-1 left-0 h-2 w-full rounded-full bg-sol/70" />
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-vinho/80">
              A EventeIA pede orçamentos aos fornecedores da sua região <strong>pelo WhatsApp</strong>,
              compara tudo e te entrega <strong>3 opções prontas</strong>: a de melhor{" "}
              <strong>preço</strong>, a de melhor <strong>custo-benefício</strong> e a de mais{" "}
              <strong>comodidade</strong>.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/registrar" className={primaryCta}>
                Começar agora <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="#planos"
                className="inline-flex items-center justify-center rounded-full border-2 border-vinho/15 bg-off-white px-6 py-3.5 text-base font-semibold text-vinho transition hover:border-vinho/30"
              >
                Ver planos e preços
              </Link>
            </div>
            <p className="mt-3 text-sm text-vinho/75">
              Ticket avulso: <strong className="text-vinho">{formatBRL(ticketPriceCents)} por evento</strong> ·
              sem mensalidade · Pix ou cartão via Asaas
            </p>

            {/* Depoimentos curtos — prova social logo de cara */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {heroTestimonials.map((t) => (
                <figure key={t.id} className="rounded-2xl border border-line-subtle bg-off-white p-4 shadow-soft">
                  <p aria-hidden="true" className="text-sol">★★★★★</p>
                  <blockquote className="mt-1 text-sm leading-6 text-vinho/85">“{t.quote}”</blockquote>
                  <figcaption className="mt-3 text-caption text-vinho/70">
                    <strong className="text-vinho">{t.name}</strong> · {t.context}
                    {t.city.length > 0 ? ` · ${t.city}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
            {heroIsExample ? <p className="mt-2 text-[11px] text-vinho/60">{EXAMPLE_TESTIMONIALS_NOTE}</p> : null}
          </div>

          {/* Mosaico de fotos */}
          <div
            className="order-first grid auto-rows-[92px] grid-cols-3 gap-2 sm:auto-rows-[150px] sm:gap-3 lg:order-none lg:h-[560px] lg:auto-rows-auto lg:grid-rows-3"
            aria-label="Tipos de evento"
          >
            {MOSAIC.map((photo, index) => (
              <figure
                key={photo.src}
                className={`relative overflow-hidden rounded-2xl bg-areia-secundaria shadow-soft ${
                  "big" in photo ? "col-span-2 row-span-2" : ""
                }`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.w}
                  height={photo.h}
                  priority={index === 0}
                  sizes={index === 0 ? "(max-width: 1024px) 66vw, 380px" : "(max-width: 1024px) 33vw, 190px"}
                  className="h-full w-full object-cover"
                />
                <figcaption className="absolute bottom-2 left-2 rounded-full bg-off-white/95 px-2.5 py-0.5 text-[11px] font-bold text-vinho">
                  {photo.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Selos de confiança ================= */}
      <section aria-label="Por que confiar" className="border-y border-line-subtle bg-off-white">
        <ul className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {TRUST.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-menta/15 text-sm font-bold text-[#17735F]">
                ✓
              </span>
              <div>
                <p className="text-sm font-bold text-vinho">{item.title}</p>
                <p className="mt-0.5 text-caption leading-5 text-vinho/75">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ================= As 3 opções ================= */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8">
        <p className="eyebrow">O que você recebe</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">
          Três caminhos claros. Você só escolhe.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {OPTIONS.map((o) => (
            <article key={o.title} className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
              <span aria-hidden="true" className={`block h-2 w-10 rounded-full ${o.dot}`} />
              <h3 className="mt-4 font-serif text-title-2 font-display">{o.title}</h3>
              <p className="mt-2 text-sm leading-6 text-vinho/75">{o.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ================= Como funciona ================= */}
      <section className="bg-off-white py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <p className="eyebrow">Como funciona</p>
          <h2 className="mt-3 max-w-2xl font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">
            Do “preciso organizar” ao “já escolhi” em 4 passos.
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-card bg-areia-quente p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-vinho font-serif text-lg font-display text-off-white">
                  {s.n}
                </span>
                <h3 className="mt-4 font-serif text-title-3 font-display">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-vinho/75">{s.text}</p>
              </li>
            ))}
          </ol>
          <Link href="/como-funciona" className="mt-8 inline-block text-sm font-semibold text-vinho underline decoration-champagne decoration-2 underline-offset-8">
            Ver o passo a passo completo
          </Link>
        </div>
      </section>

      {/* ================= Tipos de evento ================= */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8">
        <p className="eyebrow">Para todo tipo de evento</p>
        <h2 className="mt-3 max-w-2xl font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">
          Da festinha em casa à convenção da empresa.
        </h2>
        <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {EVENT_TYPES.map((e) => (
            <li key={e.label} className="rounded-2xl border border-line-subtle bg-off-white p-4">
              <p className="font-serif text-base font-display text-vinho">{e.label}</p>
              <p className="mt-1 text-caption text-vinho/70">{e.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ================= Planos ================= */}
      <section id="planos" className="scroll-mt-24 bg-vinho py-16 text-off-white">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <p className="text-overline font-bold uppercase text-champagne">Planos</p>
          <h2 className="mt-3 max-w-2xl font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">
            Pague só pelo seu evento. Ou assine, se você organiza vários.
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            <article className="flex flex-col rounded-card bg-off-white p-6 text-vinho shadow-raised ring-4 ring-champagne lg:col-span-1">
              <p className="text-overline font-bold uppercase text-coral-escuro">Ticket avulso</p>
              <h3 className="mt-2 font-serif text-title-2 font-display">Para o seu evento</h3>
              <p className="mt-4 font-serif text-[2.4rem] font-display leading-none">{formatBRL(ticketPriceCents)}</p>
              <p className="mt-1 text-caption text-vinho/70">pagamento único por evento</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-vinho/80">
                <li>✓ Sem mensalidade</li>
                <li>✓ Cotações pelo WhatsApp</li>
                <li>✓ 3 opções comparadas</li>
                <li>✓ Pix ou cartão</li>
              </ul>
              <Link href="/registrar" className={`${primaryCta} mt-6 w-full py-3 text-sm`}>
                Começar agora
              </Link>
            </article>

            {PLANS.map((plan) => (
              <article
                key={plan.code}
                className={`flex flex-col rounded-card p-6 ${
                  plan.featured ? "bg-off-white/10 ring-2 ring-champagne-claro/60" : "bg-off-white/5 ring-1 ring-off-white/15"
                }`}
              >
                <p className="text-overline font-bold uppercase text-champagne-claro">
                  {plan.featured ? "Planners · mais escolhido" : "Planners"}
                </p>
                <h3 className="mt-2 font-serif text-title-2 font-display">{plan.name}</h3>
                <p className="mt-4 font-serif text-[2rem] font-display leading-none">{formatBRL(plan.priceCents)}</p>
                <p className="mt-1 text-caption text-off-white/70">por mês · {plan.credits} eventos</p>
                <p className="mt-4 flex-1 text-sm text-off-white/80">{plan.description}</p>
                <Link
                  href="/planos"
                  className="mt-6 inline-flex justify-center rounded-full border-2 border-off-white/30 px-5 py-3 text-sm font-semibold transition hover:border-off-white/60"
                >
                  Ver detalhes
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Testimonials items={realTestimonials.length > 0 ? realTestimonials : undefined} />

      {/* ================= FAQ ================= */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
        <p className="eyebrow">Dúvidas frequentes</p>
        <h2 className="mt-3 font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">Perguntas que a gente sempre ouve</h2>
        <div className="mt-8 divide-y divide-line-subtle rounded-card border border-line-subtle bg-off-white">
          {FAQ.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-vinho">
                {item.q}
                <span aria-hidden="true" className="text-xl text-coral-escuro transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-vinho/75">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ================= CTA final ================= */}
      <section className="px-4 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-5xl rounded-[2rem] bg-gradient-to-br from-champagne-claro via-areia-secundaria to-sol/40 px-6 py-14 text-center">
          <h2 className="font-serif text-[clamp(1.8rem,3.6vw,2.6rem)] font-display leading-tight">
            Seu evento merece ser curtido, não administrado.
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-vinho/80">
            Conte o que você imagina. A EventeIA corre atrás dos orçamentos e te mostra as melhores opções.
          </p>
          <Link href="/registrar" className={`${primaryCta} mt-8`}>
            Testar agora <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
