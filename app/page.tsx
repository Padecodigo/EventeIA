import Header from "../components/header"

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F7F3EE]">
      <Header />
      <section id="inicio" className="mx-auto max-w-4xl px-4 pb-12 pt-8 text-left sm:pb-16 sm:pt-16">
        <span className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-[#C5A56F]">• INTELIGÊNCIA PARA EVENTOS EXTRAORDINÁRIOS</span>
        <h1 className="mb-6 font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#3D1B28] sm:text-5xl md:text-6xl">A clareza financeira e a inteligência que o seu evento merece.</h1>
        <p className="mb-8 max-w-2xl font-sans text-base font-normal leading-relaxed text-[#3D1B28]/80 sm:text-lg">Você foca no sonho, a Eventeia foca nos custos. Cotações inteligentes via WhatsApp, comparação transparente de cenários e controle total do seu orçamento.</p>
        <div className="flex flex-wrap gap-4">
          <a href="#comecar" className="rounded-full bg-[#3D1B28] px-7 py-3.5 font-semibold text-[#F7F3EE] transition-colors hover:bg-[#2A121C]">Criar Primeiro Evento</a>
          <a href="#funciona" className="rounded-full border border-[#3D1B28]/30 px-7 py-3.5 font-semibold text-[#3D1B28] transition-colors hover:border-[#3D1B28]">Ver Como Funciona</a>
        </div>
      </section>
    </main>
  )
}
