import { Bricolage_Grotesque, DM_Sans, Figtree, Fraunces, Manrope, Outfit } from "next/font/google";
import Image from "next/image";
import { notFound } from "next/navigation";

import type { CSSProperties } from "react";
import { z } from "zod";

import { formatBRL } from "@/lib/money";

/**
 * DEV ONLY — prévia de 3 direções de estilo para a landing (Fase A).
 * Em produção responde 404. Uso: /dev/estilos (todas) ou /dev/estilos?opcao=1|2|3.
 * Nada aqui altera o estilo principal do site.
 */
export const metadata = { title: "Prévia de estilos (dev)", robots: { index: false, follow: false } };

const outfit = Outfit({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f1h", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--f1b", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f2h", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--f2b", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--f3h", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--f3b", display: "swap" });

type StyleOption = {
  id: 1 | 2 | 3;
  name: string;
  mood: string;
  colors: { bg: string; bg2: string; ink: string; primary: string; primaryInk: string; accent: string; accentSoft: string };
  heading: { varName: string; label: string };
  body: { varName: string; label: string };
  headline: string;
  highlight: string;
  sub: string;
};

const STYLE_OPTIONS: readonly StyleOption[] = [
  {
    id: 1,
    name: "Sol de Domingo",
    mood: "Tropical, ensolarado e acolhedor — almoço de família no quintal, com acabamento premium.",
    colors: { bg: "#FFFBF5", bg2: "#FFE8D6", ink: "#0E3B43", primary: "#E8573A", primaryInk: "#FFFFFF", accent: "#F5B83D", accentSoft: "#FFF1CC" },
    heading: { varName: "var(--f1h)", label: "Outfit" },
    body: { varName: "var(--f1b)", label: "DM Sans" },
    headline: "Seu evento perfeito começa",
    highlight: "sem correria.",
    sub: "Você conta o que sonhou. A gente pede orçamentos aos fornecedores da sua região, compara proposta por proposta e te entrega as 3 melhores opções — preço, custo-benefício e comodidade.",
  },
  {
    id: 2,
    name: "Confete",
    mood: "Festivo e contemporâneo — energia de festa, mas com sofisticação de marca de lifestyle.",
    colors: { bg: "#FCF8FF", bg2: "#F1E7FF", ink: "#221B4B", primary: "#D93A6E", primaryInk: "#FFFFFF", accent: "#2FBFA5", accentSoft: "#DDF7F1" },
    heading: { varName: "var(--f2h)", label: "Bricolage Grotesque" },
    body: { varName: "var(--f2b)", label: "Manrope" },
    headline: "Você sonha a festa.",
    highlight: "A gente corre atrás dos orçamentos.",
    sub: "Buffet, decoração, foto, som: pedimos as propostas, comparamos tudo e te mostramos 3 opções claras para decidir com o coração — e com a cabeça tranquila.",
  },
  {
    id: 3,
    name: "Jardim",
    mood: "Elegante e natural — premium e confiável, ótimo para planners e cerimonialistas, sem cara de casamento.",
    colors: { bg: "#F6FAF7", bg2: "#E3F1EA", ink: "#13302B", primary: "#0F766E", primaryInk: "#FFFFFF", accent: "#FF9466", accentSoft: "#FFE7DC" },
    heading: { varName: "var(--f3h)", label: "Fraunces" },
    body: { varName: "var(--f3b)", label: "Figtree" },
    headline: "Menos ligações,",
    highlight: "mais memórias.",
    sub: "A EventeIA cota com os fornecedores da sua região e compara cada proposta por você. Do aniversário à formatura, você escolhe entre 3 opções prontas — e aproveita o que importa.",
  },
];

const PHOTOS = [
  { src: "/img/eventos/festa-infantil-velas.jpg", alt: "Crianças apagando as velinhas", label: "Festa infantil", pos: "left-[25%] top-[1%] w-[42%] -rotate-2 z-30", ratio: "aspect-[4/5]" },
  { src: "/img/eventos/casamento.jpg", alt: "Noivos rindo na pista de dança", label: "Casamento", pos: "right-0 top-[3%] w-[38%] rotate-[5deg] z-20", ratio: "aspect-[4/3]" },
  { src: "/img/eventos/15-anos.jpg", alt: "Debutante com vestido bordado", label: "15 anos", pos: "left-0 top-[6%] w-[27%] -rotate-[7deg] z-20", ratio: "aspect-[3/4]" },
  { src: "/img/eventos/festa-formatura.jpg", alt: "Formando comemorando com confete", label: "Formatura", pos: "right-[1%] bottom-[1%] w-[42%] rotate-[3deg] z-40", ratio: "aspect-[4/3]" },
  { src: "/festa-infantil.jpg", alt: "Mesa decorada com arco de balões", label: "Aniversário", pos: "left-[3%] bottom-0 w-[37%] -rotate-[4deg] z-40", ratio: "aspect-[6/5]" },
] as const;

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

function Hero({ option }: { option: StyleOption }) {
  const c = option.colors;
  const vars = {
    "--bg": c.bg,
    "--bg2": c.bg2,
    "--ink": c.ink,
    "--p": c.primary,
    "--pi": c.primaryInk,
    "--a": c.accent,
    "--as": c.accentSoft,
    fontFamily: `${option.body.varName}, system-ui, sans-serif`,
  } as CSSProperties;
  const heading = { fontFamily: `${option.heading.varName}, system-ui, sans-serif` } as CSSProperties;

  return (
    <section id={`opcao-${option.id}`} style={vars} className="relative isolate overflow-hidden bg-[var(--bg)] text-[color:var(--ink)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_85%_10%,var(--bg2),transparent),radial-gradient(40%_50%_at_0%_100%,var(--as),transparent)]" />
      <div className="flex items-center justify-between border-b border-black/5 px-8 py-3 text-xs">
        <span className="text-lg font-bold" style={heading}>EventeIA</span>
        <span className="rounded-full bg-black/5 px-3 py-1 font-semibold">
          Opção {option.id} · {option.name} · {option.heading.label} + {option.body.label}
        </span>
        <span className="rounded-full bg-[var(--p)] px-4 py-1.5 font-semibold text-[color:var(--pi)]">Começar agora</span>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-8 pb-16 pt-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <p className="inline-flex rounded-full bg-[var(--as)] px-3 py-1 text-xs font-semibold">
            Festa infantil · Aniversário · 15 anos · Formatura · Casamento · Corporativo
          </p>
          <h1 style={heading} className="mt-5 text-[clamp(2.3rem,4.6vw,3.9rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            {option.headline} <span className="text-[color:var(--p)]">{option.highlight}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-80">{option.sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--p)] px-7 py-3.5 font-semibold text-[color:var(--pi)] shadow-[0_12px_28px_-10px_var(--p)]">Começar agora →</span>
            <span className="rounded-full border border-black/10 bg-white px-6 py-3.5 font-semibold">Ver planos e preços</span>
          </div>
          <p className="mt-5 text-sm">
            <span className="rounded-full bg-white px-3 py-1 font-semibold shadow-sm ring-1 ring-black/5">
              Ticket avulso · {formatBRL(ticketPriceCents)} por evento
            </span>{" "}
            <span className="opacity-70">Sem mensalidade · Pix seguro ou cartão</span>
          </p>
          <figure className="mt-7 max-w-xl rounded-3xl bg-white/85 p-5 shadow-[0_24px_50px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
            <p className="tracking-[0.2em] text-[color:var(--a)]">★★★★★</p>
            <blockquote className="mt-1 text-[15px] leading-relaxed opacity-85">
              “No dia, eu só chorei de emoção vendo a Lia apagar as velinhas. Pela primeira vez não passei a festa resolvendo problema.”
            </blockquote>
            <figcaption className="mt-2 text-sm opacity-60">Camila R. · Mãe da Lia · São José dos Campos, SP (exemplo)</figcaption>
          </figure>
        </div>

        <div className="relative mx-auto aspect-[10/9] w-full max-w-[640px] lg:aspect-auto lg:h-[540px]">
          {PHOTOS.map((photo, index) => (
            <figure
              key={photo.src}
              className={`group absolute ${photo.pos} rounded-[18px] bg-white p-2.5 pb-9 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)] ring-1 ring-black/5 transition duration-500 hover:z-50 hover:-translate-y-2 hover:rotate-0 hover:scale-[1.06]`}
            >
              <div className={`relative overflow-hidden rounded-[12px] ${photo.ratio}`}>
                <Image src={photo.src} alt={photo.alt} fill priority={index === 0} sizes="300px" className="object-cover transition duration-700 group-hover:scale-110" />
              </div>
              <figcaption style={heading} className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold">
                {photo.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="flex gap-2 px-8 pb-6 text-[11px] font-mono opacity-70">
        {Object.entries(c).map(([key, hex]) => (
          <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-black/5">
            <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: hex }} />
            {key} {hex}
          </span>
        ))}
      </div>
    </section>
  );
}

const querySchema = z.object({ opcao: z.enum(["1", "2", "3"]).optional() });

export default async function EstilosPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const parsed = querySchema.safeParse(await searchParams);
  const selected = parsed.success && parsed.data.opcao !== undefined ? Number(parsed.data.opcao) : null;
  const list = selected === null ? STYLE_OPTIONS : STYLE_OPTIONS.filter((o) => o.id === selected);

  return (
    <main className={`${outfit.variable} ${dmSans.variable} ${bricolage.variable} ${manrope.variable} ${fraunces.variable} ${figtree.variable}`}>
      {list.map((option) => (
        <Hero key={option.id} option={option} />
      ))}
    </main>
  );
}
