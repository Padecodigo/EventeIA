import Header from "../components/header"

const benefits = [
  { number: "01", title: "Tudo começa com um sonho", text: "Descreva o evento que você imagina. A Eventeia transforma desejos em um plano possível, bonito e consciente." },
  { number: "02", title: "Clareza para escolher melhor", text: "Receba cotações organizadas, compare cenários e entenda onde cada real encontra o seu propósito." },
  { number: "03", title: "Presença para viver o momento", text: "Menos planilhas e preocupações. Mais tempo para celebrar, decidir com calma e estar presente." },
]

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F7F3EE]">
      <Header />

      <section id="inicio" className="mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-20 lg:pb-28 lg:pt-24">
        <div className="max-w-2xl">
          <span className="eyebrow">• Inteligência para eventos extraordinários</span>
          <h1 className="mt-5 font-serif text-[clamp(2.6rem,6vw,5.8rem)] font-medium leading-[.98] tracking-[-.045em] text-[#3D1B28]">O seu evento merece ser vivido. <em>Não administrado.</em></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#3D1B28]/70 sm:text-lg sm:leading-8">A Eventeia cuida da clareza financeira para que você possa cuidar do que realmente importa: criar memórias que ficam para sempre.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#comecar" className="rounded-full bg-[#3D1B28] px-6 py-3.5 text-sm font-medium text-[#F7F3EE] shadow-[0_8px_24px_rgba(61,27,40,.16)] transition-all hover:-translate-y-0.5 hover:bg-[#2A121C]">Criar meu evento <span aria-hidden="true">↗</span></a>
            <a href="#como-funciona" className="text-sm font-medium text-[#3D1B28] underline decoration-[#C5A56F] underline-offset-8 transition-colors hover:text-[#C5A56F]">Descobrir como funciona</a>
          </div>
          <div className="mt-12 flex items-center gap-3 border-t border-[#EEE7DF] pt-5 text-xs text-[#3D1B28]/60">
            <div className="flex -space-x-2"><span className="avatar bg-[#C9A58B]">M</span><span className="avatar bg-[#87606A]">A</span><span className="avatar bg-[#D0B77A]">L</span></div>
            <span>Feito para quem acredita que cada detalhe importa.</span>
          </div>
        </div>
        <div className="relative lg:pl-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[#C5A56F]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#EEE7DF] bg-[#FFFDFA] p-2 shadow-[0_24px_70px_rgba(61,27,40,.10)]">
            <img src="/eventeia-wedding.png" alt="Recepção de casamento elegante iluminada por velas" className="aspect-[.92] w-full rounded-[1.5rem] object-cover" />
            <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/40 bg-[#FFFDFA]/90 p-4 backdrop-blur-md"><p className="font-serif text-lg text-[#3D1B28]">O orçamento também pode ser parte do sonho.</p><p className="mt-1 text-xs text-[#3D1B28]/60">Planejamento com intenção, do primeiro sim ao último brinde.</p></div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="border-y border-[#EEE7DF] bg-[#FFFDFA] px-4 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-24"><div><span className="eyebrow">Uma nova forma de planejar</span><h2 className="mt-5 max-w-md font-serif text-4xl leading-tight tracking-[-.03em] text-[#3D1B28] sm:text-5xl">Menos ruído. Mais <em>presença.</em></h2></div><div className="grid gap-8 sm:grid-cols-3">{benefits.map((benefit) => <article key={benefit.number} className="border-t border-[#C5A56F]/60 pt-4"><span className="text-xs font-semibold tracking-widest text-[#C5A56F]">{benefit.number}</span><h3 className="mt-8 font-serif text-2xl leading-tight text-[#3D1B28]">{benefit.title}</h3><p className="mt-4 text-sm leading-6 text-[#3D1B28]/65">{benefit.text}</p></article>)}</div></div></div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:py-28"><div className="overflow-hidden rounded-[1.75rem] border border-[#EEE7DF] bg-[#FFFDFA] p-2"><img src="/eventeia-planner.png" alt="Planner organizando o orçamento de um evento" className="aspect-[.9] w-full rounded-[1.35rem] object-cover" /></div><div className="lg:pl-12"><span className="eyebrow">Para noivos, anfitriões e planners</span><blockquote className="mt-6 font-serif text-3xl leading-tight tracking-[-.025em] text-[#3D1B28] sm:text-5xl">“A tranquilidade de saber que está tudo sob controle muda completamente a forma como você vive o seu evento.”</blockquote><div className="mt-8 flex items-center gap-3"><div className="avatar size-10 bg-[#87606A] text-xs">C</div><div><p className="text-sm font-semibold text-[#3D1B28]">Camila Andrade</p><p className="text-xs text-[#3D1B28]/55">Cerimonialista, São Paulo</p></div></div></div></section>

      <section id="comecar" className="mx-4 mb-8 overflow-hidden rounded-[2rem] bg-[#3D1B28] px-6 py-16 text-center sm:mx-8 sm:px-12 lg:py-24"><img src="/eventeia-celebration.png" alt="Brinde celebrando um evento inesquecível" className="absolute hidden" /><span className="eyebrow text-[#D9BD85]">O próximo capítulo começa aqui</span><h2 className="mx-auto mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-.03em] text-[#F7F3EE] sm:text-6xl">Seu evento pode ser exatamente como você imaginou.</h2><a href="#inicio" className="mt-9 inline-flex rounded-full bg-[#F7F3EE] px-7 py-3.5 text-sm font-medium text-[#3D1B28] transition-transform hover:-translate-y-0.5">Começar agora <span className="ml-2" aria-hidden="true">↗</span></a></section>
      <footer className="px-8 pb-8 text-center text-xs text-[#3D1B28]/45">Eventeia — inteligência para eventos extraordinários.</footer>
    </main>
  )
}
