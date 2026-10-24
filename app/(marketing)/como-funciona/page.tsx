import Link from "next/link";

import {
  TestimonialCard,
  TESTIMONIALS,
} from "@/components/marketing/testimonials";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { pageMetadata } from "@/lib/seo/site";

const STEPS = [
  {
    number: "01",
    title: "Conte o que você imagina",
    text: "Descreva seu casamento, festa ou evento corporativo: data, cidade, estilo e o que não pode faltar.",
    details: [
      "Festa infantil, aniversário, casamento, formatura, batizado ou corporativo",
      "Data, cidade, número de convidados e prioridades",
      "Rascunhar é gratuito e leva poucos minutos",
    ],
  },
  {
    number: "02",
    title: "A EventeIA prospecta",
    text: "Nossa inteligência encontra fornecedores relevantes e entra em contato em seu nome, sem buscas intermináveis.",
    details: [
      "Fornecedores alinhados ao seu tipo de festa e região",
      "Contato feito por nós, com o seu contexto",
      "Propostas organizadas por categoria, sem planilhas soltas",
    ],
  },
  {
    number: "03",
    title: "Receba propostas claras",
    text: "Os orçamentos chegam organizados para você comparar caminhos, valores e possibilidades com tranquilidade.",
    details: [
      "Faixa mínima, sugestão e teto para cada categoria",
      "Você aprova cada fornecedor — nada é fechado sem o seu “sim”",
      "Compare lado a lado e decida no seu tempo",
    ],
  },
];

const DELIVERABLES = [
  {
    title: "Orçamento explicado",
    text: "Motor determinístico: os mesmos dados produzem o mesmo resultado, e cada linha tem uma regra clara.",
  },
  {
    title: "Propostas comparáveis",
    text: "Fornecedores organizados por categoria, com valores e escopo na mesma estrutura de leitura.",
  },
  {
    title: "Disparos com consentimento",
    text: "Envio das propostas por WhatsApp apenas para quem autorizou — sem listas, sem spam.",
  },
  {
    title: "Histórico do evento",
    text: "Tudo o que aconteceu fica registrado: você acompanha decisões e não perde nenhuma versão.",
  },
];

const testimonial = TESTIMONIALS.find((item) => item.id === "camila");

export const metadata = pageMetadata({
  title: "Como funciona",
  description:
    "Veja como a EventeIA monta o orçamento da sua festa: você conta o que imagina, cotamos fornecedores pelo WhatsApp e entregamos 3 opções comparadas.",
  path: "/como-funciona",
  keywords: ["como fazer orçamento de festa", "cotação de fornecedores"],
});

export default function ComoFuncionaPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8 sm:py-24">
        <p className="eyebrow">Como a EventeIA faz acontecer</p>
        <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.4rem,5vw,4.4rem)] font-display leading-[1.02] tracking-[-0.03em] text-vinho">
          Da primeira ideia à proposta que faz <em className="italic">sentido.</em>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-vinho/70">
          O trabalho de encontrar, contatar e organizar fornecedores acontece nos bastidores. Você
          recebe clareza para tomar a decisão certa — sem planilhas e sem achismo.
        </p>

        <div className="mt-16 grid gap-10 border-t border-line-subtle pt-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <article key={step.number} className="border-t border-champagne/60 pt-5">
              <span className="text-xs font-semibold tracking-[0.16em] text-vinho/70">
                {step.number}
              </span>
              <h2 className="mt-6 font-serif text-2xl leading-tight text-vinho">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-vinho/75">{step.text}</p>
              <ul className="mt-5 space-y-2 text-caption leading-5 text-vinho/75">
                {step.details.map((detail) => (
                  <li key={detail} className="flex gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne"
                      aria-hidden="true"
                    />
                    {detail}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <TrustStrip />

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
        <p className="eyebrow">O que chega até você</p>
        <h2 className="mt-3 max-w-2xl font-serif text-display-2 font-display leading-tight">
          Clareza para decidir. Efetividade para acontecer.
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {DELIVERABLES.map((item) => (
            <article key={item.title} className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
              <h3 className="font-serif text-title-2">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-vinho/75">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-line-subtle bg-off-white py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="eyebrow">Histórias de clareza</p>
            <h2 className="mt-3 font-serif text-display-2 font-display leading-tight">
              “Eu não queria festa de revista. Queria caber na nossa vida.”
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-vinho/75">
              Festas de tamanhos e orçamentos diferentes. A mesma clareza para decidir — e a mesma
              atenção para o que importa.
            </p>
            <Link
              href="/registrar"
              className="mt-8 inline-flex rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-white transition hover:bg-primaria-escura"
            >
              Começar o meu evento
            </Link>
          </div>

          {testimonial !== undefined ? <TestimonialCard testimonial={testimonial} /> : null}
        </div>
      </section>
    </>
  );
}
