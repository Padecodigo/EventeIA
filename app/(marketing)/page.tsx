import Image from "next/image";
import Link from "next/link";

import { TESTIMONIALS, Testimonials } from "@/components/marketing/testimonials";
import { formatBRL } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { getPublishedTestimonials } from "@/lib/testimonials";

export const revalidate = 60;

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

/**
 * Colagem do hero — fotos sobrepostas estilo polaroid (pessoas, emoção, festa bonita).
 * Festa infantil em destaque (maior público), mas todos os tipos de evento presentes.
 * Créditos das fotos novas em public/img/eventos/CREDITOS.md.
 */
const MOSAIC = [
  {
    src: "/img/eventos/festa-infantil-velas.jpg",
    alt: "Crianças sorrindo enquanto apagam as velinhas de um bolo de aniversário",
    label: "Festa infantil",
    w: 834,
    h: 1250,
    pos: "left-[25%] top-[1%] w-[42%] -rotate-2 z-30",
    ratio: "aspect-[4/5]",
  },
  {
    src: "/img/eventos/casamento.jpg",
    alt: "Noivos rindo juntos na pista de dança, cercados pelos convidados",
    label: "Casamento",
    w: 1000,
    h: 667,
    pos: "right-0 top-[3%] w-[38%] rotate-[5deg] z-20",
    ratio: "aspect-[4/3]",
  },
  {
    src: "/img/eventos/15-anos.jpg",
    alt: "Debutante com vestido bordado segurando um buquê",
    label: "15 anos",
    w: 1000,
    h: 1250,
    pos: "left-0 top-[6%] w-[27%] -rotate-[7deg] z-20",
    ratio: "aspect-[3/4]",
  },
  {
    src: "/img/eventos/formatura-familia.jpg",
    alt: "Pais abraçando o filho formando, todos sorrindo de orgulho",
    label: "Formatura",
    w: 1000,
    h: 667,
    pos: "right-[1%] bottom-[1%] w-[42%] rotate-[3deg] z-40",
    ratio: "aspect-[4/3]",
  },
  {
    src: "/festa-infantil.jpg",
    alt: "Mesa de festa decorada com arco de balões, bolo e doces",
    label: "Aniversário",
    w: 1280,
    h: 1075,
    pos: "left-[3%] bottom-0 w-[37%] -rotate-[4deg] z-40",
    ratio: "aspect-[6/5]",
  },
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
  { title: "Preço", text: "A combinação mais barata entre as propostas que chegaram, já com taxas incluídas.", dot: "from-emerald-400 to-teal-500" },
  { title: "Custo-benefício", text: "O melhor equilíbrio entre valor e qualidade — o que mais vale a pena.", dot: "from-orange-400 to-rose-500" },
  { title: "Comodidade", text: "Menos fornecedores, menos dor de cabeça: pacotes que resolvem mais coisas juntos.", dot: "from-indigo-400 to-violet-500" },
] as const;

const STEPS = [
  { n: "1", title: "Conte sobre o evento", text: "Tipo de festa, data, cidade, convidados e o que não pode faltar. Leva poucos minutos." },
  { n: "2", title: "A gente pede os orçamentos", text: "Falamos com fornecedores da sua região pelo WhatsApp, com calma e sem spam." },
  { n: "3", title: "Comparamos tudo", text: "Lemos cada resposta, achamos taxas escondidas e colocamos tudo na mesma régua." },
  { n: "4", title: "Você escolhe", text: "Receba 3 opções — preço, custo-benefício e comodidade — e decida com tranquilidade." },
] as const;

const TRUST = [
  { title: "Pagamento seguro", text: "Pix seguro ou cartão, com processamento por instituição de pagamento regulada." },
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
    a: "Pix seguro ou cartão. Você recebe a confirmação na hora em que o pagamento é aprovado.",
  },
] as const;

const primaryCta =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-vinho px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_-6px_rgba(90,40,15,0.45)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#3D2B25] hover:shadow-[0_14px_32px_-8px_rgba(90,40,15,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-escuro focus-visible:ring-offset-2 active:translate-y-0";

const sectionTitle = "font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.035em] text-vinho";

function Stars() {
  return (
    <span aria-label="5 de 5 estrelas" className="flex gap-0.5 text-amber-400">
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
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#FFF1E6] via-[#FFF7F0] to-[#FFF8F1]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 right-[-8%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,0.28),transparent)]" />
          <div className="absolute -left-32 bottom-0 h-[460px] w-[460px] rounded-full bg-[radial-gradient(closest-side,rgba(255,201,77,0.22),transparent)]" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-14 pt-4 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12 lg:pb-20 lg:pt-10">
          <div className="ev-fade-up">
            <p className="eyebrow hidden sm:inline-flex">
              <span aria-hidden="true" className="text-coral-escuro">♥</span>
              Festa infantil · 15 anos · Formatura · Casamento · Corporativo
            </p>
            <h1 className="mt-0 font-display text-[clamp(2.1rem,4.8vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-vinho sm:mt-5">
              Curta a festa com quem você ama.{" "}
              <span className="relative inline-block font-script text-[1.18em] font-bold leading-none tracking-normal text-coral-escuro">
                A gente cuida do resto.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-vinho/75 sm:mt-6 sm:text-lg">
              Menos estresse, mais tempo pra viver cada detalhe. A gente conversa com os fornecedores da sua região pelo WhatsApp e te
              entrega <strong className="font-semibold text-vinho">3 opções</strong> prontas — a de melhor{" "}
              <strong className="font-semibold text-vinho">preço</strong>, a de melhor{" "}
              <strong className="font-semibold text-vinho">custo-benefício</strong> e a de mais{" "}
              <strong className="font-semibold text-vinho">comodidade</strong>. Você só escolhe, com o coração tranquilo.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <Link href="/registrar" className={primaryCta}>
                Começar agora
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="#planos"
                className="inline-flex items-center justify-center rounded-full border border-champagne-claro bg-white/80 px-6 py-3.5 text-[15px] font-semibold text-vinho backdrop-blur transition hover:border-champagne hover:bg-white"
              >
                Ver planos e preços
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-vinho/70">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 font-medium text-coral-escuro shadow-sm ring-1 ring-champagne-claro">
                Ticket avulso · <strong className="font-bold">{formatBRL(ticketPriceCents)}</strong> por evento
              </span>
              <span>Sem mensalidade · Pix seguro ou cartão</span>
            </div>

            {mainTestimonial ? (
              <figure className="mt-7 max-w-xl rounded-3xl border border-white bg-white/80 p-5 shadow-[0_24px_50px_-28px_rgba(194,65,12,0.45)] backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-rose-400 text-sm font-bold text-white ring-4 ring-[#FFF1E6]"
                  >
                    {initials(mainTestimonial.name)}
                  </span>
                  <div className="min-w-0">
                    <Stars />
                    <blockquote className="mt-2 text-[15px] leading-relaxed text-vinho/85">“{mainTestimonial.quote}”</blockquote>
                    <figcaption className="mt-3 text-sm text-vinho/60">
                      <strong className="font-semibold text-vinho">{mainTestimonial.name}</strong> · {mainTestimonial.context}
                      {mainTestimonial.city.length > 0 ? ` · ${mainTestimonial.city}` : ""}
                    </figcaption>
                  </div>
                </div>
              </figure>
            ) : null}
          </div>

          {/* Colagem polaroid — sobreposição com profundidade; hover endireita, aproxima e traz pra frente */}
          <div className="order-first lg:order-none">
            <div className="relative mx-auto aspect-[10/9] w-full max-w-[640px] lg:aspect-auto lg:h-[540px]" aria-label="Momentos de festa">
              {MOSAIC.map((photo, index) => (
                <figure
                  key={photo.src}
                  className={`ev-photo group absolute ${photo.pos} rounded-[18px] bg-white p-1.5 pb-6 shadow-[0_18px_40px_-14px_rgba(90,40,15,0.45)] ring-1 ring-black/5 transition duration-500 ease-out hover:z-50 hover:-translate-y-2 hover:rotate-0 hover:scale-[1.06] hover:shadow-[0_34px_70px_-20px_rgba(90,40,15,0.6)] sm:p-2.5 sm:pb-9`}
                >
                  <div className={`relative overflow-hidden rounded-[12px] ${photo.ratio}`}>
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      priority={index === 0}
                      sizes={index === 0 ? "(max-width: 1024px) 46vw, 300px" : "(max-width: 1024px) 40vw, 260px"}
                      className="object-cover transition duration-700 ease-out group-hover:scale-110"
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#C2410C]/25 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
                  </div>
                  <figcaption className="absolute inset-x-0 bottom-0.5 text-center font-script text-base font-bold leading-6 text-vinho/80 transition duration-500 group-hover:-translate-y-0.5 group-hover:text-coral-escuro sm:bottom-1.5 sm:text-2xl sm:leading-7">
                    {photo.label}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mx-auto mt-4 hidden w-fit items-center gap-3 rounded-full bg-white/85 px-4 py-2 shadow-[0_14px_30px_-18px_rgba(90,40,15,0.5)] ring-1 ring-champagne-claro backdrop-blur lg:flex">
              <span className="text-sm font-semibold text-vinho">Você recebe 3 opções prontas</span>
              {OPTIONS.map((o) => (
                <span key={o.title} className={`rounded-full bg-gradient-to-r ${o.dot} px-2.5 py-0.5 text-[11px] font-semibold text-white`}>
                  {o.title}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Faixa de tipos de evento em movimento */}
        <div className="relative border-y border-champagne-claro bg-white/60 py-4 backdrop-blur [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <ul className="ev-marquee flex w-max gap-10 whitespace-nowrap font-script text-xl font-bold text-vinho/60">
            {[...EVENT_TYPES, ...EVENT_TYPES].map((e, i) => (
              <li key={`${e.label}-${i}`} aria-hidden={i >= EVENT_TYPES.length} className="flex items-center gap-10">
                {e.label}
                <span aria-hidden="true" className="text-coral">♥</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= Selos de confiança ================= */}
      <section aria-label="Por que confiar" className="bg-white">
        <ul className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {TRUST.map((item) => (
            <li key={item.title} className="rounded-2xl border border-champagne-claro bg-areia-quente p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(90,40,15,0.3)]">
              <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-emerald-700 shadow-sm ring-1 ring-champagne-claro">
                ✓
              </span>
              <p className="mt-4 text-[15px] font-semibold text-vinho">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-vinho/70">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ================= As 3 opções ================= */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="eyebrow">O que você recebe</p>
          <h2 className={`mt-4 max-w-2xl ${sectionTitle}`}>Três caminhos claros. Você só escolhe.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {OPTIONS.map((o, i) => (
              <article
                key={o.title}
                className="group relative overflow-hidden rounded-3xl border border-champagne-claro bg-white p-7 shadow-[0_1px_2px_rgba(90,40,15,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(90,40,15,0.3)]"
              >
                <div aria-hidden="true" className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${o.dot} opacity-10 blur-2xl transition duration-500 group-hover:opacity-25`} />
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${o.dot} text-sm font-bold text-white`}>
                  {i + 1}
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-vinho">{o.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-vinho/70">{o.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Como funciona ================= */}
      <section className="bg-areia-quente">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="eyebrow">Como funciona</p>
          <h2 className={`mt-4 max-w-2xl ${sectionTitle}`}>Do “preciso organizar” ao “já escolhi” em 4 passos.</h2>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-3xl bg-white p-7 ring-1 ring-champagne-claro">
                <span className="font-display text-sm font-bold text-coral-escuro">Passo {s.n}</span>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-vinho">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-vinho/70">{s.text}</p>
              </li>
            ))}
          </ol>
          <Link href="/como-funciona" className="mt-10 inline-flex items-center gap-1 text-sm font-semibold text-vinho hover:text-coral-escuro">
            Ver o passo a passo completo <span aria-hidden="true">→</span>
          </Link>
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
                className="group rounded-2xl border border-champagne-claro bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-coral/40 hover:shadow-[0_16px_40px_-20px_rgba(255,122,69,0.5)]"
              >
                <p className="font-display text-base font-bold text-vinho">{e.label}</p>
                <p className="mt-1 text-sm text-vinho/60">{e.hint}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= Planos ================= */}
      <section id="planos" className="relative isolate scroll-mt-24 overflow-hidden bg-gradient-to-b from-[#FFE9DA] to-[#FFF4EA] py-20 text-vinho lg:py-28">
        <div aria-hidden="true" className="absolute left-1/2 top-0 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,0.25),transparent)]" />
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <p className="eyebrow">Planos</p>
          <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.035em]">
            Pague só pelo seu evento. Ou assine, se você organiza vários.
          </h2>
          <div className="mt-12 grid gap-5 lg:grid-cols-4">
            <article className="flex flex-col rounded-3xl bg-white p-7 text-vinho shadow-[0_30px_60px_-20px_rgba(255,122,69,0.45)] ring-2 ring-coral">
              <p className="text-xs font-bold uppercase tracking-wider text-coral-escuro">Ticket avulso</p>
              <h3 className="mt-2 font-display text-xl font-bold">Para o seu evento</h3>
              <p className="mt-5 font-display text-5xl font-extrabold tracking-tight">{formatBRL(ticketPriceCents)}</p>
              <p className="mt-1 text-sm text-vinho/60">pagamento único por evento</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-vinho/80">
                <li>✓ Sem mensalidade</li>
                <li>✓ Cotações pelo WhatsApp</li>
                <li>✓ 3 opções comparadas</li>
                <li>✓ Pix ou cartão</li>
              </ul>
              <Link href="/registrar" className="mt-7 inline-flex justify-center rounded-full bg-coral px-5 py-3 text-sm font-bold text-vinho transition hover:bg-[#FF8B5C]">
                Começar agora
              </Link>
            </article>

            {PLANS.map((plan) => (
              <article
                key={plan.code}
                className={`flex flex-col rounded-3xl p-7 backdrop-blur transition duration-300 hover:-translate-y-1 ${
                  plan.featured ? "bg-white/90 ring-1 ring-champagne shadow-[0_24px_50px_-30px_rgba(90,40,15,0.45)]" : "bg-white/70 ring-1 ring-champagne-claro"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-vinho/55">
                  {plan.featured ? "Planners · mais escolhido" : "Planners"}
                </p>
                <h3 className="mt-2 font-display text-xl font-bold">{plan.name}</h3>
                <p className="mt-5 font-display text-4xl font-extrabold tracking-tight">{formatBRL(plan.priceCents)}</p>
                <p className="mt-1 text-sm text-vinho/60">por mês · {plan.credits} eventos</p>
                <p className="mt-5 flex-1 text-sm leading-relaxed text-vinho/75">{plan.description}</p>
                <Link href="/planos" className="mt-7 inline-flex justify-center rounded-full border border-vinho/15 px-5 py-3 text-sm font-semibold transition hover:bg-white">
                  Ver detalhes
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Testimonials items={realTestimonials.length > 0 ? realTestimonials : undefined} />

      {/* ================= FAQ ================= */}
      <section className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
        <p className="eyebrow">Dúvidas frequentes</p>
        <h2 className={`mt-4 ${sectionTitle}`}>Perguntas que a gente sempre ouve</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-champagne-claro bg-white p-5 transition open:shadow-[0_12px_30px_-18px_rgba(90,40,15,0.3)]">
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
        <div className="relative isolate mx-auto w-full max-w-5xl overflow-hidden rounded-[2.5rem] bg-vinho px-6 py-16 text-center text-white sm:py-20">
          <div aria-hidden="true" className="absolute -top-24 left-1/2 -z-10 h-80 w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,0.45),transparent)]" />
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.035em]">
            Seu evento merece ser curtido, não administrado.
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-white/75">
            Conte o que você imagina. A EventeIA corre atrás dos orçamentos e te mostra as melhores opções.
          </p>
          <Link href="/registrar" className="group mt-9 inline-flex items-center gap-2 rounded-full bg-coral px-7 py-3.5 font-semibold text-vinho transition hover:-translate-y-0.5 hover:bg-[#FF8B5C]">
            Testar agora <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
