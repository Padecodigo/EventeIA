const wine = "#3D1B28"

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F7F3EE]">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[#EEE7DF] px-6 py-5 lg:px-10">
        <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-full border border-[#C5A56F] text-2xl font-serif text-[#C5A56F]">E</div><div><div className="font-serif text-2xl font-semibold text-[#3D1B28]">Eventeia</div><div className="text-[10px] font-medium uppercase tracking-wider text-[#C5A56F]">Você imagina. A Eventeia faz acontecer.</div></div></div>
        <div className="flex items-center gap-3"><button className="hidden rounded-full border border-[#3D1B28] px-5 py-2 text-sm font-semibold text-[#3D1B28] sm:block">Entrar</button><button className="rounded-full bg-[#3D1B28] px-5 py-2.5 text-sm font-semibold text-[#F7F3EE]">Começar agora</button></div>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-24 lg:px-10 lg:pt-32"><div className="max-w-4xl"><p className="mb-6 text-sm font-bold uppercase tracking-[0.18em] text-[#C5A56F]">• Inteligência para eventos extraordinários</p><h1 className="font-serif text-5xl leading-[1.02] tracking-[-0.04em] text-[#3D1B28] sm:text-7xl lg:text-8xl">A clareza financeira e a inteligência que o seu evento merece.</h1><p className="mt-8 max-w-2xl text-lg leading-8 text-[#3D1B28]/70">Você foca no sonho, a Eventeia foca nos custos. Cotações inteligentes via WhatsApp, comparação transparente de cenários e controle total do seu orçamento.</p><div className="mt-10 flex flex-wrap gap-4"><button className="rounded-full bg-[#3D1B28] px-7 py-3.5 font-semibold text-[#F7F3EE]">Criar Primeiro Evento</button><button className="rounded-full border border-[#3D1B28]/30 px-7 py-3.5 font-semibold text-[#3D1B28]">Ver Como Funciona</button></div></div></section>
    </main>
  )
}
