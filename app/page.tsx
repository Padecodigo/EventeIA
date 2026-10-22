export default function Home() {
  return (
    <main className="min-h-screen bg-[#F7F3EE]">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[#EEE7DF] px-6 py-4 md:px-12">
        <div className="flex items-center gap-3 shrink-0">
          <img src="/logo-e.png" alt="Eventeia Logo" className="h-10 w-auto object-contain bg-transparent mix-blend-multiply" />
          <div className="flex flex-col justify-center">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#3D1B28] leading-none">Eventeia</span>
            <span className="text-[9px] tracking-widest text-[#C5A56F] font-semibold uppercase leading-tight mt-1">Você imagina. A Eventeia faz acontecer.</span>
          </div>
        </div>
        <nav aria-label="Navegação principal" className="flex items-center gap-3">
          <button className="hidden rounded-full border border-[#3D1B28] px-5 py-2 text-sm font-semibold text-[#3D1B28] transition-colors hover:bg-[#3D1B28] hover:text-[#F7F3EE] sm:block">Entrar</button>
          <button className="rounded-full px-6 py-2.5 text-sm font-medium bg-[#3D1B28] text-[#F7F3EE] hover:bg-[#2A121C] transition-all">Começar agora</button>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 md:px-12 md:pt-28">
        <div className="max-w-4xl">
          <p className="mb-6 text-sm font-bold uppercase tracking-[0.18em] text-[#C5A56F]">• Inteligência para eventos extraordinários</p>
          <h1 className="text-3xl sm:text-5xl font-serif text-[#3D1B28] leading-tight font-bold max-w-3xl">A clareza financeira e a inteligência que o seu evento merece.</h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#3D1B28]/70">Você foca no sonho, a Eventeia foca nos custos. Cotações inteligentes via WhatsApp, comparação transparente de cenários e controle total do seu orçamento.</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <button className="rounded-full bg-[#3D1B28] px-7 py-3.5 font-semibold text-[#F7F3EE] transition-colors hover:bg-[#2A121C]">Criar Primeiro Evento</button>
            <button className="rounded-full border border-[#3D1B28]/30 px-7 py-3.5 font-semibold text-[#3D1B28] transition-colors hover:border-[#3D1B28]">Ver Como Funciona</button>
          </div>
        </div>
      </section>
    </main>
  )
}
