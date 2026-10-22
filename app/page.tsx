import { ArrowUpRight, Check, Menu, Sparkles } from "lucide-react"

const benefits = [
  { number: "01", title: "Cotações inteligentes", text: "Converse pelo WhatsApp e transforme suas ideias em cotações claras, sem planilhas intermináveis." },
  { number: "02", title: "Cenários transparentes", text: "Compare possibilidades lado a lado e escolha com segurança o caminho ideal para o seu evento." },
  { number: "03", title: "Orçamento sob controle", text: "Tenha uma visão viva dos custos, decisões e prioridades — do primeiro brinde ao último detalhe." },
]

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="Eventeia início">
          <img src="/logo-e.png" alt="Eventeia Logo" className="h-10 w-auto object-contain" />
          <span className="flex flex-col">
            <span className="font-[Fraunces] text-2xl font-bold leading-none tracking-[-0.04em] text-[#3D1B28]">Eventeia</span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.13em] text-[#C5A56F]">Você imagina. A Eventeia faz acontecer.</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#3D1B28]/70 md:flex" aria-label="Navegação principal">
          <a href="#como-funciona" className="transition-colors hover:text-[#3D1B28]">Como funciona</a>
          <a href="#para-quem" className="transition-colors hover:text-[#3D1B28]">Para quem é</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#entrar" className="hidden rounded-full border border-[#3D1B28] px-5 py-2.5 text-sm font-semibold text-[#3D1B28] transition-colors hover:bg-[#3D1B28] hover:text-[#F7F3EE] sm:inline-flex">Entrar</a>
          <a href="#começar" className="rounded-full bg-[#3D1B28] px-5 py-2.5 text-sm font-semibold text-[#F7F3EE] shadow-[0_8px_20px_rgba(61,27,40,0.14)] transition-transform hover:-translate-y-0.5">Começar agora</a>
          <button className="rounded-full p-2 text-[#3D1B28] md:hidden" aria-label="Abrir menu"><Menu /></button>
        </div>
      </header>

      <section id="top" className="relative mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-10 lg:pb-32 lg:pt-24">
        <div className="pointer-events-none absolute -right-36 top-10 hidden size-[420px] rounded-full border border-[#C5A56F]/20 lg:block" />
        <div className="pointer-events-none absolute -right-20 top-28 hidden size-[270px] rounded-full border border-[#C5A56F]/15 lg:block" />
        <div className="relative max-w-5xl">
          <div className="mb-7 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[#C5A56F]"><span className="text-base">•</span> Inteligência para eventos extraordinários</div>
          <h1 className="max-w-5xl font-[Fraunces] text-[clamp(3.1rem,8vw,7.35rem)] font-medium leading-[0.94] tracking-[-0.055em] text-[#3D1B28]">A clareza financeira e a inteligência que o seu evento merece.</h1>
          <div className="mt-9 flex max-w-2xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-base leading-7 text-[#3D1B28]/68">Você foca no sonho, a Eventeia foca nos custos. Cotações inteligentes via WhatsApp, comparação transparente de cenários e controle total do seu orçamento.</p>
            <div className="flex shrink-0 items-center gap-4 text-sm font-semibold"><a href="#como-funciona" className="inline-flex items-center gap-2 text-[#3D1B28] underline decoration-[#C5A56F] underline-offset-8">Ver como funciona <ArrowUpRight className="size-4" /></a></div>
          </div>
          <div className="mt-10 flex flex-wrap gap-3"><a href="#começar" className="inline-flex items-center gap-2 rounded-full bg-[#3D1B28] px-6 py-3.5 text-sm font-semibold text-[#F7F3EE] shadow-[0_12px_25px_rgba(61,27,40,0.16)] transition-transform hover:-translate-y-0.5">Criar primeiro evento <ArrowUpRight className="size-4" /></a><a href="#como-funciona" className="rounded-full border border-[#3D1B28]/25 px-6 py-3.5 text-sm font-semibold text-[#3D1B28] transition-colors hover:border-[#3D1B28]">Ver como funciona</a></div>
        </div>
        <div className="mt-20 flex items-center gap-4 border-t border-[#EEE7DF] pt-6 text-xs font-semibold uppercase tracking-[0.14em] text-[#3D1B28]/45"><Sparkles className="size-4 text-[#C5A56F]" /> Menos planilhas. Mais presença. Mais celebração.</div>
      </section>

      <section id="como-funciona" className="border-y border-[#EEE7DF] bg-[#FFFDFA] px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl"><div className="mb-14 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#C5A56F]">A inteligência por trás</p><h2 className="max-w-xl font-[Fraunces] text-4xl leading-tight tracking-[-0.04em] text-[#3D1B28] md:text-5xl">Seu evento no centro. A complexidade, com a gente.</h2></div><p className="max-w-sm text-sm leading-6 text-[#3D1B28]/60">Uma nova forma de planejar, decidir e celebrar — com clareza em cada etapa.</p></div><div className="grid gap-px overflow-hidden rounded-2xl border border-[#EEE7DF] bg-[#EEE7DF] md:grid-cols-3">{benefits.map((benefit) => <article key={benefit.number} className="bg-[#FFFDFA] p-7 lg:p-9"><span className="text-xs font-bold tracking-[0.2em] text-[#C5A56F]">{benefit.number}</span><h3 className="mt-16 font-[Fraunces] text-2xl tracking-[-0.03em] text-[#3D1B28]">{benefit.title}</h3><p className="mt-4 text-sm leading-6 text-[#3D1B28]/60">{benefit.text}</p><Check className="mt-8 size-5 text-[#C5A56F]" /></article>)}</div></div>
      </section>

      <section id="para-quem" className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28"><div className="rounded-3xl bg-[#3D1B28] px-7 py-12 text-[#F7F3EE] md:px-14 md:py-16"><div className="flex flex-col justify-between gap-10 md:flex-row md:items-end"><div><p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-[#C5A56F]">Para momentos que importam</p><h2 className="max-w-2xl font-[Fraunces] text-4xl leading-tight tracking-[-0.04em] md:text-6xl">Planeje com a cabeça. Viva com o coração.</h2></div><a href="#começar" className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[#C5A56F] px-6 py-3.5 text-sm font-bold text-[#3D1B28] transition-transform hover:-translate-y-0.5 md:self-end">Começar agora <ArrowUpRight className="size-4" /></a></div></div></section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-[#EEE7DF] px-6 py-8 text-xs text-[#3D1B28]/50 sm:flex-row sm:items-center sm:justify-between lg:px-10"><span className="font-[Fraunces] text-xl font-semibold text-[#3D1B28]">Eventeia</span><span>Você imagina. A Eventeia faz acontecer.</span><span>© 2026 Eventeia</span></footer>
    </main>
  )
}
