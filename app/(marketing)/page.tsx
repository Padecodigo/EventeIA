import Image from "next/image";
import Link from "next/link";

import { KidsPartyIllustration } from "@/components/marketing/kids-party-illustration";
import { Testimonials } from "@/components/marketing/testimonials";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { formatBRL } from "@/lib/money";
import { getPublishedTestimonials } from "@/lib/testimonials";

const EVENT_TYPES = ["Festa infantil", "Aniversário", "Casamento", "Formatura", "Batizado", "Corporativo"];

const STEPS = [
  {
    number: "01",
    title: "Conte o que você imagina",
    text: "Tema, idade, data, convidados e o que não pode faltar. Sem planilha, sem burocracia.",
  },
  {
    number: "02",
    title: "A EventeIA prospecta",
    text: "Encontramos fornecedores relevantes, entramos em contato e organizamos as propostas por categoria.",
  },
  {
    number: "03",
    title: "Escolha com clareza",
    text: "Você compara faixas de valor, aprova cada fornecedor e segue para a festa com o orçamento explicado.",
  },
];

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

export const revalidate = 60;

const hoverCard =
  "group relative shrink-0 snap-center rounded-[1.4rem] border p-2 shadow-raised transition-[transform,box-shadow] duration-500 ease-editorial hover:z-40 hover:-translate-y-2 hover:rotate-0 hover:shadow-[0_24px_60px_rgba(74,32,49,0.18)] focus-visible:z-40 focus-visible:-translate-y-2 focus-visible:rotate-0 focus-visible:shadow-[0_24px_60px_rgba(74,32,49,0.18)]";

function PhotoChip({ label }: { label: string }) {
  return (
    <span className="absolute bottom-3 left-3 rounded-full bg-off-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-vinho backdrop-blur">
      {label}
    </span>
  );
}

export default async function LandingPage() {
  const realTestimonials = await getPublishedTestimonials();
  return (
    <>
      {/* 1) Fotos — a primeira coisa que se vê ao acessar */}
      <section
        aria-label="Festas que a EventeIA organiza"
        className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-8"
      >
        <div className="flex snap-x snap-mandatory items-start gap-5 overflow-x-auto pb-4 [scrollbar-width:none] sm:justify-center sm:overflow-visible sm:pb-0">
          <article
            tabIndex={0}
            aria-label="Celebração com taças"
            className={`${hoverCard} z-20 w-[240px] rotate-[3deg] border-line-subtle bg-off-white sm:mt-10 sm:w-[320px]`}
          >
            <div className="relative overflow-hidden rounded-[1rem]">
              <Image
                src="/EventeIA-celebration.png"
                alt="Pessoas brindando em uma comemoração com luzes ao fundo"
                width={1376}
                height={768}
                sizes="(max-width: 640px) 70vw, 320px"
                className="aspect-[4/5] w-full object-cover"
              />
              <PhotoChip label="Celebração" />
            </div>
          </article>

          <article
            tabIndex={0}
            aria-label="Festa infantil"
            className={`${hoverCard} z-30 w-[250px] -rotate-[2deg] border-line-subtle bg-off-white sm:w-[350px] sm:scale-[1.05]`}
          >
            <div className="relative overflow-hidden rounded-[1rem]">
              <Image
                src="/festa-infantil.jpg"
                alt="Mesa de festa de 1 aninho com arco de balões, bolo e doces"
                width={1280}
                height={1075}
                priority
                sizes="(max-width: 640px) 70vw, 350px"
                className="aspect-[4/5] w-full object-cover"
              />
              <PhotoChip label="Festa infantil" />
            </div>
          </article>

          <article
            tabIndex={0}
            aria-label="Casamento"
            className={`${hoverCard} z-10 w-[240px] rotate-[2deg] border-line-subtle bg-off-white sm:-ml-8 sm:mt-14 sm:w-[320px]`}
          >
            <div className="relative overflow-hidden rounded-[1rem]">
              <Image
                src="/EventeIA-wedding.png"
                alt="Recepção de casamento à luz de velas, com mesa posta e convidados"
                width={1376}
                height={768}
                sizes="(max-width: 640px) 70vw, 320px"
                className="aspect-[4/5] w-full object-cover"
              />
              <PhotoChip label="Casamento" />
            </div>
          </article>

          <article
            tabIndex={0}
            aria-label="Festa em casa"
            className={`${hoverCard} z-20 w-[210px] -rotate-[3deg] border-champagne/50 bg-champagne-claro sm:-ml-12 sm:mt-24 sm:w-[230px]`}
          >
            <div className="relative overflow-hidden rounded-[1rem] bg-champagne-claro">
              <KidsPartyIllustration className="aspect-[4/5] w-full" />
              <PhotoChip label="Festa em casa" />
            </div>
          </article>
        </div>
      </section>

      {/* 2) Título — logo abaixo das fotos */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 text-center sm:px-8">
        <p className="eyebrow mx-auto">• Inteligência para festas infantis e todos os momentos</p>
        <h1 className="mt-5 font-serif text-[clamp(2.6rem,5.6vw,4.6rem)] font-display leading-[1.0] tracking-[-0.03em] text-vinho">
          O seu evento merece ser vivido.{" "}
          <em className="italic">Não administrado.</em>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-vinho/70">
          Você imagina a festa da sua filha. A EventeIA encontra fornecedores, organiza as
          propostas e explica cada número — para você escolher com clareza, no seu tempo e no seu
          orçamento. Vale para festa infantil, aniversário, casamento e qualquer evento.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/registrar"
            className="rounded-full bg-vinho px-7 py-3.5 text-sm font-medium text-off-white shadow-[0_8px_24px_rgba(74,32,49,0.16)] transition hover:-translate-y-0.5 hover:bg-vinho/90"
          >
            Começar agora <span aria-hidden="true">↗</span>
          </Link>
          <Link
            href="/como-funciona"
            className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-8 transition-colors hover:decoration-champagne-claro"
          >
            Ver como funciona
          </Link>
        </div>

        <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-caption text-vinho/75">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
            Sem mensalidade para anfitriões
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
            Pagamento único por evento
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
            Você aprova cada fornecedor
          </li>
        </ul>
      </section>

      <TrustStrip />

      {/* Prova de produto — orçamento explicado */}
      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <p className="eyebrow">Clareza que se vê</p>
          <h2 className="mt-3 max-w-xl font-serif text-display-2 font-display leading-tight">
            Cada linha do orçamento, explicada.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-vinho/75">
            O motor financeiro calcula faixas por categoria e mostra de onde vem cada valor. As
            propostas chegam organizadas para você comparar com calma — e aprovar só o que fizer
            sentido.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-vinho/75">
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
              Orçamento explicado item a item
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
              Propostas comparáveis lado a lado
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
              Você aprova cada passo — nada é fechado sem o seu “sim”
            </li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-[2rem] border border-line-subtle bg-off-white p-6 shadow-raised">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vinho/70">
                Orçamento do evento
              </p>
              <span className="rounded-full bg-areia-secundaria px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-vinho/75">
                exemplo
              </span>
            </div>
            <p className="mt-2 font-serif text-title-1">Festa de 5 anos da Lia</p>
            <p className="text-caption text-vinho/70">60 convidados · São José dos Campos, SP</p>

            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-vinho/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
                  Buffet
                </span>
                <span className="tabular-nums text-vinho">R$ 4.480,00</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-vinho/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
                  Decoração
                </span>
                <span className="tabular-nums text-vinho">R$ 2.150,00</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-vinho/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
                  Música
                </span>
                <span className="tabular-nums text-vinho">R$ 1.280,00</span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-vinho/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-champagne" aria-hidden="true" />
                  Fotografia
                </span>
                <span className="tabular-nums text-vinho">R$ 1.900,00</span>
              </li>
            </ul>

            <div className="mt-5 flex items-center justify-between border-t border-champagne/50 pt-4">
              <span className="font-serif text-lg">Total estimado</span>
              <span className="font-serif text-2xl tabular-nums">R$ 9.810,00</span>
            </div>
            <p className="mt-3 text-caption text-vinho/70">
              Cada linha é explicada — você sabe de onde vem o valor.
            </p>
          </div>

          <div className="ml-auto mt-4 w-[88%] rounded-2xl border border-champagne/40 bg-vinho p-5 text-off-white shadow-raised">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-champagne-claro">
              WhatsApp · proposta recebida
            </p>
            <p className="mt-2 text-sm leading-6 text-off-white/90">
              “Olá, Camila. Chegaram três propostas de buffet para a festa da Lia. A melhor faixa
              ficou em R$ 4.200.”
            </p>
            <p className="mt-3 text-[10px] text-off-white/70">Enviado com o seu consentimento</p>
          </div>
        </div>
      </section>

      {/* Para todos os tipos de festa */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Para festas de todos os tamanhos</p>
            <h2 className="mt-3 max-w-2xl font-serif text-display-2 font-display leading-tight">
              Do salão do bairro ao espaço mais bonito da cidade.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-vinho/75">
            A clareza é a mesma. O que muda é o sonho — e ele é seu.
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap gap-2">
          {EVENT_TYPES.map((type) => (
            <li
              key={type}
              className="rounded-full border border-line-subtle bg-off-white px-4 py-2 text-sm text-vinho/75"
            >
              {type}
            </li>
          ))}
        </ul>
      </section>

      {/* Como funciona (resumo) */}
      <section className="border-y border-line-subtle bg-off-white py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Como a EventeIA faz acontecer</p>
              <h2 className="mt-3 max-w-2xl font-serif text-display-2 font-display leading-tight">
                Três passos. Nenhuma dúvida no caminho.
              </h2>
            </div>
            <Link
              href="/como-funciona"
              className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-8"
            >
              Ver o passo a passo completo
            </Link>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <article key={step.number} className="border-t border-champagne/60 pt-5">
                <span className="text-xs font-semibold tracking-[0.16em] text-vinho/70">
                  {step.number}
                </span>
                <h3 className="mt-6 font-serif text-title-2 leading-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-vinho/75">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Dois públicos */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
        <p className="eyebrow">Feita para dois jeitos de criar</p>
        <h2 className="mt-3 max-w-2xl font-serif text-display-2 font-display leading-tight">
          Simples para quem sonha. Poderosa para quem organiza.
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <article className="flex flex-col rounded-card border border-line-subtle bg-off-white p-8 shadow-soft sm:p-10">
            <p className="eyebrow">Anfitriões</p>
            <h3 className="mt-3 font-serif text-title-1">Um tíquete. Um evento. Tudo claro.</h3>
            <p className="mt-4 text-sm leading-6 text-vinho/70">
              Pague uma única vez pela sua festa — {formatBRL(ticketPriceCents)} — e receba o
              orçamento completo, as propostas organizadas e o envio pelo WhatsApp. Festa infantil,
              aniversário ou casamento.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-vinho/70">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                Sem assinatura e sem renovação automática
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                Orçamento explicado item a item
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                Cotações ilimitadas do seu evento
              </li>
            </ul>
            <Link
              href="/registrar"
              className="mt-8 inline-flex w-fit rounded-full bg-vinho px-6 py-3 text-sm font-medium text-off-white transition hover:bg-vinho/90"
            >
              Criar meu evento
            </Link>
          </article>

          <article className="flex flex-col rounded-card border border-champagne/40 bg-vinho p-8 text-off-white shadow-raised sm:p-10">
            <p className="eyebrow">Planners e cerimonialistas</p>
            <h3 className="mt-3 font-serif text-title-1 text-off-white">
              Créditos que acompanham o seu ritmo.
            </h3>
            <p className="mt-4 text-sm leading-6 text-off-white/80">
              Assine uma franquia mensal de créditos e gerencie os eventos dos seus clientes em um só
              lugar — com histórico, controle e curadoria preservada.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-off-white/75">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                1 crédito por evento ativado
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                Franquia que acompanha o seu ciclo
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden="true" />
                Pacotes avulsos sem validade
              </li>
            </ul>
            <Link
              href="/para-planners"
              className="mt-8 inline-flex w-fit rounded-full bg-champagne px-6 py-3 text-sm font-medium text-vinho transition hover:bg-champagne-claro"
            >
              Conhecer o plano de planners
            </Link>
          </article>
        </div>
      </section>

      <Testimonials items={realTestimonials.length > 0 ? realTestimonials : undefined} />

      {/* Manifesto — conceito emocional preservado */}
      <section className="bg-vinho py-24 text-off-white">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-champagne">
            O nosso jeito
          </p>
          <p className="mt-6 font-serif text-display-2 leading-tight">
            “Você imagina.
            <br />
            A EventeIA faz acontecer.”
          </p>
          <p className="mx-auto mt-6 max-w-prose text-base leading-8 text-off-white/75">
            A clareza financeira e a inteligência que o seu evento merece. Sem planilhas soltas, sem
            surpresas no cartão, sem perder o que importa: as pessoas e o momento.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 text-center sm:px-8">
        <h2 className="font-serif text-display-2 font-display">O seu evento começa com uma decisão clara.</h2>
        <p className="mx-auto mt-4 max-w-prose text-vinho/70">
          Crie sua conta, descreva o que imagina e veja o orçamento ganhar forma — sem planilhas, sem
          achismo, no seu tempo.
        </p>
        <Link
          href="/registrar"
          className="mt-8 inline-flex rounded-full bg-vinho px-8 py-4 text-sm font-medium text-off-white transition hover:bg-vinho/90"
        >
          Criar meu evento agora
        </Link>
      </section>
    </>
  );
}
