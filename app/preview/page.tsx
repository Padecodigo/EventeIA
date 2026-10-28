import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Preview de design · EventeIA",
  robots: { index: false, follow: false },
};

const PHOTOS = [
  { src: "/img/eventos/festa-infantil-velas.jpg", label: "Festa infantil" },
  { src: "/img/eventos/casamento.jpg", label: "Casamento" },
  { src: "/img/eventos/15-anos.jpg", label: "15 anos" },
  { src: "/img/eventos/festa-formatura-baile.jpg", label: "Formatura" },
  { src: "/festa-infantil.jpg", label: "Aniversário" },
  { src: "/img/eventos/corporativo.webp", label: "Corporativo" },
];

function Label({ letter, title, tone }: { letter: string; title: string; tone: "light" | "dark" }) {
  return (
    <div className="flex items-center gap-3 border-b border-current/10 pb-3">
      <span
        className={
          tone === "light"
            ? "flex h-8 w-8 items-center justify-center rounded-full bg-primaria text-sm font-bold text-white"
            : "flex h-8 w-8 items-center justify-center rounded-full bg-champagne text-sm font-bold text-vinho"
        }
      >
        {letter}
      </span>
      <p className={tone === "light" ? "text-sm font-semibold text-vinho/70" : "text-sm font-semibold text-off-white/70"}>
        {title}
      </p>
    </div>
  );
}

function Cta({ primary = true }: { primary?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <span
        className={
          primary
            ? "inline-flex items-center justify-center gap-2 rounded-full bg-primaria px-6 py-3.5 text-[15px] font-semibold text-white shadow-soft"
            : "inline-flex items-center justify-center gap-2 rounded-full bg-champagne px-6 py-3.5 text-[15px] font-semibold text-vinho"
        }
      >
        Começar agora →
      </span>
      <span className="inline-flex items-center justify-center rounded-full border border-current/20 px-6 py-3.5 text-[15px] font-semibold">
        Ver planos e preços
      </span>
    </div>
  );
}

/** VARIANTE A — Atelier editorial: refinamento do atual, grade reta e mais respiro. */
function VariantA() {
  return (
    <section className="bg-areia-quente px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Label letter="A" title="Atelier editorial — refino do atual" tone="light" />
        <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-vinho/12 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-vinho/70">
              Festa infantil · 15 anos · Casamento · Corporativo
            </p>
            <h1 className="mt-6 font-display text-[clamp(2.4rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-vinho">
              Menos ligações,
              <br />
              mais memórias.
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-vinho/70">
              A EventeIA cota com os fornecedores da sua região pelas redes sociais e compara cada
              proposta por você. Você escolhe entre <strong className="font-semibold text-vinho">3 opções prontas</strong> —
              melhor preço, custo-benefício e comodidade.
            </p>
            <div className="mt-8 text-vinho">
              <Cta />
            </div>
            <p className="mt-5 text-sm text-vinho/60">Ticket avulso R$ 97 · sem mensalidade</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {PHOTOS.map((photo) => (
              <figure key={photo.src} className="overflow-hidden rounded-2xl bg-white shadow-soft">
                <Image
                  src={photo.src}
                  alt={photo.label}
                  width={320}
                  height={320}
                  className="h-32 w-full object-cover sm:h-40"
                />
                <figcaption className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-vinho/60">
                  {photo.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** VARIANTE B — Moderno premium: hero escuro, acento dourado e glass. */
function VariantB() {
  return (
    <section className="bg-[#2A1119] px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Label letter="B" title="Moderno premium — hero escuro" tone="dark" />
        <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-off-white">
            <p className="inline-flex items-center gap-2 rounded-full border border-champagne/30 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">
              Inteligência de custos para eventos
            </p>
            <h1 className="mt-6 font-display text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-[1.0] tracking-[-0.03em]">
              Menos ligações,
              <br />
              <span className="text-champagne">mais memórias.</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-off-white/70">
              Cotações comparadas em três opções prontas, com clareza de custo do primeiro ao último
              fornecedor. Sem planilhas, sem corretagem.
            </p>
            <div className="mt-8 text-off-white">
              <Cta primary={false} />
            </div>
            <div className="mt-8 flex gap-3">
              {PHOTOS.slice(0, 3).map((photo) => (
                <div key={photo.src} className="h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-white/15">
                  <Image src={photo.src} alt="" width={120} height={120} className="h-full w-full object-cover" />
                </div>
              ))}
              <div className="flex h-16 items-center rounded-2xl bg-white/5 px-4 text-sm text-off-white/70 ring-1 ring-white/10">
                + 3 tipos de evento
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 overflow-hidden rounded-3xl ring-1 ring-white/10">
              <Image
                src={PHOTOS[0].src}
                alt="Festa infantil"
                width={720}
                height={480}
                className="h-48 w-full object-cover sm:h-56"
              />
            </div>
            {PHOTOS.slice(1, 5).map((photo) => (
              <div key={photo.src} className="overflow-hidden rounded-2xl ring-1 ring-white/10">
                <Image src={photo.src} alt={photo.label} width={360} height={240} className="h-24 w-full object-cover sm:h-28" />
              </div>
            ))}
            <div className="col-span-2 rounded-2xl bg-white/5 p-4 text-sm text-off-white/75 ring-1 ring-white/10">
              <p className="font-semibold text-champagne">3 opções prontas</p>
              <p className="mt-1">Melhor preço · Custo-benefício · Comodidade</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** VARIANTE C — Mistura: hero claro (A) + faixa escura premium (B) logo abaixo. */
function VariantC() {
  return (
    <section className="bg-areia-quente">
      <div className="px-5 pt-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Label letter="C" title="Mistura — hero claro (A) + faixa escura (B)" tone="light" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <h1 className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-vinho">
            Menos ligações,
            <br />
            mais memórias.
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-vinho/70">
            A EventeIA cota pelas redes sociais e compara cada proposta por você. Escolha entre
            três opções prontas e aproveite o evento.
          </p>
          <div className="mt-8 text-vinho">
            <Cta />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PHOTOS.slice(0, 6).map((photo) => (
            <figure key={photo.src} className="overflow-hidden rounded-2xl bg-white shadow-soft">
              <Image src={photo.src} alt={photo.label} width={320} height={320} className="h-28 w-full object-cover sm:h-36" />
            </figure>
          ))}
        </div>
      </div>
      <div className="bg-[#2A1119] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 text-off-white sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">Sempre 3 opções prontas</p>
            <p className="mt-1 font-display text-2xl font-semibold">Melhor preço · Custo-benefício · Comodidade</p>
          </div>
          <span className="rounded-full bg-champagne px-6 py-3 text-sm font-semibold text-vinho">Começar agora →</span>
        </div>
      </div>
    </section>
  );
}

export default function PreviewPage() {
  return (
    <main className="min-h-screen">
      <div className="bg-off-white px-5 py-6 text-center sm:px-8">
        <h2 className="font-serif text-title-2 text-vinho">Comparação de direção visual</h2>
        <p className="mt-1 text-sm text-vinho/60">
          Rota de preview (não indexada). <Link href="/" className="underline">Voltar para o site</Link>.
        </p>
      </div>
      <VariantA />
      <VariantB />
      <VariantC />
      <div className="bg-off-white px-5 py-8 text-center text-sm text-vinho/60 sm:px-8">
        Diga A, B ou uma mistura — e eu aplico no site inteiro.
      </div>
    </main>
  );
}
