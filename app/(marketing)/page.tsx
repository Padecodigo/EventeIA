import Image from "next/image";
import Link from "next/link";

import { HowItWorksAnimation } from "@/components/marketing/how-it-works-animation";
import { Testimonials } from "@/components/marketing/testimonials";
import { JsonLd } from "@/components/seo/json-ld";
import { formatBRL } from "@/lib/money";
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

/** Festa infantil primeiro — é o que metade de quem chega está procurando. */
const PRIMARY_TYPE = { label: "Festa infantil", hint: "Buffet, decoração, bolo e recreação para os pequenos" } as const;

const OTHER_TYPES = [
  { label: "Aniversário", hint: "Do bolo ao DJ" },
  { label: "15 anos", hint: "Salão, vestido, fotografia, valsa" },
  { label: "Formatura", hint: "Espaço, buffet, banda, foto" },
  { label: "Casamento", hint: "Cerimônia, recepção, flores" },
  { label: "Corporativo", hint: "Confraternização, convenção, coffee break" },
  { label: "Batizado e chá", hint: "Chá de bebê, revelação, batizado" },
  { label: "Celebrações", hint: "Bodas, despedidas, encontros" },
] as const;

const STEPS = [
  { n: "1", title: "Conte seu evento", text: "Tipo de festa, data, cidade, número de convidados e o que não pode faltar. Leva poucos minutos.", photo: "/img/eventos/passo-1-planejando-no-celular.webp", alt: "Mulher sorrindo no sofá enquanto conta pelo celular como vai ser a festa" },
  { n: "2", title: "A EventeIA busca e compara", text: "Encontramos fornecedores da sua região, pedimos orçamento a cada um pelas redes sociais e comparamos os preços — taxas escondidas incluídas.", photo: "/img/eventos/passo-2-buffet-orcamento.webp", alt: "Mesa de doces com brigadeiros, bolos e flores montada por um fornecedor de festa" },
  { n: "3", title: "Você recebe e decide", text: "O orçamento chega pronto, no menor preço válido entre as propostas comparáveis, com as taxas incluídas. Você só fecha com o seu “sim”.", photo: "/img/eventos/passo-3-festa-celebrando.webp", alt: "Amigos de diferentes origens brindando em uma festa de aniversário com balões" },
] as const;

const TRUST = [
  { title: "Sem spam", text: "Contato com intervalo e saída imediata quando o fornecedor pede; a conversa fica no canal dele." },
  { title: "Pagamento seguro", text: "Pix ou cartão, processados por instituição de pagamento regulada." },
  { title: "Dados protegidos", text: "Usamos seus dados só para cotar o seu evento, conforme a LGPD." },
] as const;

/**
 * Valores fictícios (não renderizar aviso — pedido do dono). Nomes de casa são inventados,
 * sem relação com fornecedores reais.
 * Mostra o diferencial: compara o total com taxas, não só o preço da vitrine.
 */
const EXAMPLE = {
  context: "Festa infantil · 40 convidados · São José dos Campos",
  category: "Buffet",
  proposals: [
    { supplier: "Buffet Estrela", cents: 268_000, note: "taxas + 10% · 40 convidados" },
    { supplier: "Buffet Jardim", cents: 254_000, note: "taxas incluídas · 40 convidados" },
    { supplier: "Buffet Aurora", cents: 279_000, note: "taxas + 8% · 40 convidados" },
  ],
  lines: [
    { item: "Buffet (40 convidados)", cents: 254_000 },
    { item: "Bolo", cents: 42_000 },
    { item: "Decoração", cents: 119_000 },
    { item: "Recreação", cents: 63_000 },
  ],
} as const;

const FAQ = buildFaq(ticketPriceCents);

const sectionTitle = "font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-ameixa";

const ctaPrimary =
  "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-coral-cta px-7 py-3.5 text-[16px] font-semibold text-white shadow-[0_12px_28px_-14px_rgba(194,65,69,0.75)] transition hover:shadow-[0_16px_34px_-14px_rgba(194,65,69,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ameixa active:scale-[0.98]";

const ctaSecondary =
  "inline-flex min-h-[52px] items-center justify-center rounded-full border border-ameixa/25 px-7 py-3.5 text-[15px] font-semibold text-ameixa transition hover:border-ameixa hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ameixa";

export default async function LandingPage() {
  const realTestimonials = await getPublishedTestimonials();

  const exampleTotal = EXAMPLE.lines.reduce((sum, line) => sum + line.cents, 0);
  const cheapestProposal = Math.min(...EXAMPLE.proposals.map((p) => p.cents));

  return (
    <>
      <JsonLd data={graph([organizationLd(), websiteLd(), serviceLd(ticketPriceCents), localBusinessLd(), faqLd(FAQ)])} />

      {/* ================= HERO (acima da dobra) ================= */}
      <section className="relative isolate overflow-hidden bg-papel">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-[-12%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(239,230,247,0.9),transparent)]" />
          <div className="absolute -left-40 top-[600px] h-[540px] w-[540px] rounded-full bg-[radial-gradient(closest-side,rgba(255,231,220,0.9),transparent)]" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:pb-16 lg:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-lilas-claro bg-pessego px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ameixa">
            Para quem está organizando um evento
          </p>

          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2rem,5.2vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ameixa">
            Sua festa sem ficar ligando para fornecedor.
            <span className="mt-3 block text-[clamp(1.15rem,2.4vw,1.65rem)] font-medium leading-[1.25] tracking-[-0.01em] text-tinta">
              A gente encontra os fornecedores, compara os preços e entrega o orçamento pronto.
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-tinta sm:text-[17px]">
            Casamento, aniversário, 15 anos, formatura ou corporativo: em vez de você ligar para um por um,
            a EventeIA pede orçamento aos fornecedores da sua região e compara tudo. Você recebe{" "}
            <strong className="font-semibold text-ameixa">um orçamento pronto</strong>, no menor preço válido
            entre as propostas comparáveis, e só decide.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Link prefetch={false} href="/registrar" className={ctaPrimary}>
              Começar agora
              <span aria-hidden="true">→</span>
            </Link>
            <Link prefetch={false} href="/como-funciona" className={ctaSecondary}>
              Ver como funciona
            </Link>
          </div>

          <p className="mt-4 text-[15px] font-semibold text-ameixa">
            <Link prefetch={false} href="#planos" className="underline-offset-4 hover:underline">
              {formatBRL(ticketPriceCents)} por evento, sem mensalidade
            </Link>
            <span className="font-normal text-tinta-suave"> · Pix ou cartão.</span>
          </p>

          <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-tinta-suave">
            {[
              "Você decide sem obrigação de fechar",
              "Comparação com taxas incluídas",
              "Dados protegidos (LGPD)",
              "Sem spam",
            ].map((seal) => (
              <li key={seal} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="text-verde-preco">✓</span>
                {seal}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[13px] text-tinta-suave">
            Atendemos com foco no Vale do Paraíba e em São Paulo.
          </p>

          <p className="mt-3 text-xs text-tinta-suave">
            É fornecedor de eventos?{" "}
            <Link prefetch={false} href="/seja-fornecedor" data-testid="link-fornecedor" className="underline underline-offset-2 hover:text-coral-cta">
              Veja como receber pedidos de orçamento
            </Link>
          </p>

          <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-borda-suave">
            <Image
              src="/img/eventos/festa-infantil-velas.jpg"
              alt="Festa infantil com bolo, velas e mesa decorada em tons claros"
              width={1200}
              height={675}
              priority
              quality={70}
              sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1152px) calc(100vw - 64px), 1104px"
              className="h-56 w-full object-cover sm:h-80 lg:h-96"
            />
          </div>
        </div>
      </section>

      {/* CTA fixo no rodapé do mobile (CSS puro, sem JS) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borda-suave bg-white px-4 py-3 sm:hidden print:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-ameixa">{formatBRL(ticketPriceCents)} por evento</p>
            <p className="text-[11px] text-tinta-suave">sem mensalidade · você decide depois</p>
          </div>
          <Link prefetch={false} href="/registrar" className={`${ctaPrimary} flex-1 whitespace-nowrap px-4 py-3 text-[15px]`}>
            Começar agora
          </Link>
        </div>
      </div>

      {/* ================= Como funciona — 3 passos, uma única vez ================= */}
      <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-24 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral-cta">Como funciona · 3 passos</p>
          <h2 id="como-funciona-titulo" className={`mt-3 max-w-2xl ${sectionTitle}`}>
            Do “não sei por onde começar” ao orçamento na mão.
          </h2>

          <div className="mt-8 max-w-2xl">
            <div className="ev-skip-offscreen">
              <HowItWorksAnimation />
            </div>
          </div>

          <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="overflow-hidden rounded-3xl bg-papel ring-1 ring-borda-suave">
                <Image
                  src={s.photo}
                  alt={s.alt}
                  width={1280}
                  height={853}
                  loading="lazy"
                  quality={70}
                  sizes="(min-width: 768px) 33vw, calc(100vw - 40px)"
                  className="aspect-[3/2] h-auto w-full object-cover"
                  data-testid={`passo-foto-${s.n}`}
                />
                <div className="p-5 sm:p-6">
                  <span className="font-display text-sm font-bold text-coral-cta">Passo {s.n}</span>
                  <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-ameixa">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-tinta">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 max-w-2xl text-[15px] text-tinta-suave">
            A EventeIA trabalha para quem contrata: não é uma rede entre fornecedores nem um classificado.
            Você não precisa procurar ninguém.
          </p>
          <Link prefetch={false} href="/como-funciona" className="mt-8 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-ameixa underline-offset-4 hover:underline">
            Ver o passo a passo completo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* ================= Selos de confiança ================= */}
      <section aria-label="Por que confiar" className="border-y border-borda-suave bg-papel">
        <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-5 py-10 sm:grid-cols-3 sm:px-8">
          {TRUST.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lilas-claro text-sm font-bold text-ameixa">
                ✓
              </span>
              <div>
                <p className="text-[15px] font-semibold text-ameixa">{item.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-tinta-suave">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ================= Como o orçamento chega ================= */}
      <section aria-labelledby="exemplo-titulo" className="bg-ameixa">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pessego">O que você recebe</p>
          <h2 id="exemplo-titulo" className="mt-3 max-w-2xl font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            Um orçamento pronto. O menor preço válido.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85">
            As propostas chegam com taxas e escopo. A gente compara o que é comparável e destaca o menor
            preço válido — se faltar cotação para alguma necessidade, isso aparece com clareza.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
            <article className="rounded-3xl border border-white/15 bg-white/[0.07] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-white">{EXAMPLE.category}</h3>
              </div>
              <p className="mt-1 text-xs text-white/70">{EXAMPLE.context}</p>

              <ul className="mt-4 space-y-2">
                {EXAMPLE.proposals.map((p) => {
                  const cheapest = p.cents === cheapestProposal;
                  return (
                    <li
                      key={p.supplier}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
                        cheapest ? "bg-white/95 text-ameixa ring-2 ring-verde-vivo" : "bg-white/[0.04] text-white/85"
                      }`}
                    >
                      <span>
                        {p.supplier}
                        <span className={`block text-[11px] ${cheapest ? "text-tinta-suave" : "text-white/75"}`}>
                          {p.note}
                        </span>
                      </span>
                      <span className={`tabular-nums ${cheapest ? "font-bold text-verde-preco" : ""}`}>
                        {formatBRL(p.cents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-white/75">
                O valor válido já inclui as taxas obrigatórias — a proposta mais barata na vitrine nem
                sempre é a mais barata no total.
              </p>
            </article>

            <article className="rounded-3xl bg-papel p-5 text-tinta shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] sm:p-6">
              <h3 className="font-display text-lg font-bold text-ameixa">Orçamento pronto</h3>
              <p className="text-xs text-tinta-suave">{EXAMPLE.context}</p>

              <dl className="mt-4 divide-y divide-borda-suave">
                {EXAMPLE.lines.map((line) => (
                  <div key={line.item} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <dt className="text-tinta">{line.item}</dt>
                    <dd className="tabular-nums font-medium text-ameixa">{formatBRL(line.cents)}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-borda-suave">
                <span className="text-sm font-semibold text-ameixa">Total com taxas</span>
                <span className="tabular-nums font-display text-xl font-bold text-verde-preco">{formatBRL(exampleTotal)}</span>
              </div>

            </article>
          </div>
        </div>
      </section>

      {/* ================= Tipos de evento (festa infantil em destaque) ================= */}
      <section aria-labelledby="tipos-titulo" className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral-cta">Para todo tipo de evento</p>
          <h2 id="tipos-titulo" className={`mt-3 max-w-2xl ${sectionTitle}`}>
            Da festinha em casa ao evento corporativo.
          </h2>

          <Link
            prefetch={false}
            href="/registrar"
            className="mt-8 flex min-h-[44px] flex-col gap-1 rounded-3xl border-2 border-coral-vivo bg-pessego p-6 transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-22px_rgba(232,87,90,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ameixa sm:max-w-md"
          >
            <span className="font-display text-xl font-bold text-ameixa">{PRIMARY_TYPE.label}</span>
            <span className="text-sm leading-relaxed text-tinta">{PRIMARY_TYPE.hint}</span>
            <span className="mt-2 text-sm font-semibold text-ameixa underline underline-offset-4">Começar por aqui →</span>
          </Link>

          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {OTHER_TYPES.map((e) => (
              <li key={e.label}>
                <Link
                  prefetch={false}
                  href="/registrar"
                  className="flex h-full min-h-[44px] flex-col rounded-2xl border border-borda-suave bg-papel p-4 transition hover:-translate-y-0.5 hover:border-coral-vivo/60 hover:shadow-[0_16px_40px_-24px_rgba(91,42,78,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ameixa"
                >
                  <span className="font-display text-[15px] font-bold text-ameixa">{e.label}</span>
                  <span className="mt-1 text-[13px] leading-snug text-tinta-suave">{e.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= Preços ================= */}
      <section id="planos" className="relative isolate scroll-mt-24 overflow-hidden bg-papel py-16 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral-cta">Preços</p>
          <h2 className="mt-3 max-w-2xl font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-ameixa">
            Pague só pelo seu evento.
          </h2>

          <article className="mt-9 grid grid-cols-1 gap-6 rounded-3xl bg-white p-6 shadow-[0_24px_50px_-30px_rgba(91,42,78,0.35)] ring-2 ring-coral-vivo sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-coral-cta">Ticket avulso</p>
              <p className="mt-2 font-display text-[clamp(2.5rem,6vw,3.5rem)] font-semibold leading-none tracking-tight text-ameixa">
                {formatBRL(ticketPriceCents)}
              </p>
              <p className="mt-2 text-sm text-tinta-suave">pagamento único por evento · sem mensalidade</p>
              <ul className="mt-4 grid grid-cols-1 gap-1.5 text-sm text-tinta sm:grid-cols-2">
                <li>✓ Cotações pelas redes sociais</li>
                <li>✓ Um orçamento pronto</li>
                <li>✓ Taxas incluídas na comparação</li>
                <li>✓ Pix ou cartão</li>
              </ul>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <Link prefetch={false} href="/registrar" className={`${ctaPrimary} w-full lg:w-auto`}>
                Começar agora
              </Link>
              <span className="text-xs text-tinta-suave">Você decide sem obrigação de fechar.</span>
            </div>
          </article>

        </div>
      </section>

      <Testimonials items={realTestimonials.length > 0 ? realTestimonials : undefined} />

      {/* ================= FAQ em acordeão ================= */}
      <section id="perguntas" aria-labelledby="faq-titulo" className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral-cta">Dúvidas frequentes</p>
        <h2 id="faq-titulo" className={`mt-3 ${sectionTitle}`}>Perguntas que a gente sempre ouve</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-borda-suave bg-white p-5 open:shadow-[0_12px_30px_-18px_rgba(91,42,78,0.25)]">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ameixa focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ameixa">
                {item.q}
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lilas-claro text-lg text-ameixa transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta-suave">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ================= CTA final ================= */}
      <section className="bg-white px-5 pb-28 sm:px-8 sm:pb-20">
        <div className="relative isolate mx-auto w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-ameixa px-6 py-14 text-center text-white sm:py-16">
          <div aria-hidden="true" className="absolute -top-24 left-1/2 -z-10 h-80 w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,231,220,0.28),transparent)]" />
          <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em]">
            Seu evento merece ser curtido, não administrado.
          </h2>
          <p className="mx-auto mt-3 max-w-prose text-[15px] text-white/85">
            Conte o que você imagina. A EventeIA corre atrás dos orçamentos e te entrega o menor preço válido.
          </p>
          <Link prefetch={false} href="/registrar" className={`${ctaPrimary} mt-7`}>
            Começar agora <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-3 text-xs text-white/70">{formatBRL(ticketPriceCents)} por evento · sem mensalidade</p>
        </div>
      </section>
    </>
  );
}
