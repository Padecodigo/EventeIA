import Header from "../components/header"

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F7F3EE]">
      <Header />
      <section className="mx-auto grid min-h-[calc(100vh-68px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[1fr_.9fr] lg:gap-20 lg:py-16">
        <div className="max-w-2xl">
          <span className="eyebrow">• Inteligência para eventos extraordinários</span>
          <h1 className="mt-5 font-serif text-[clamp(2.8rem,6vw,5.8rem)] font-medium leading-[.98] tracking-[-.045em] text-[#3D1B28]">O seu evento merece ser vivido. <em>Não administrado.</em></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#3D1B28]/70 sm:text-lg sm:leading-8">Você imagina. A <span className="font-brand">EventeIA</span> encontra fornecedores, busca orçamentos e organiza propostas para você escolher com clareza.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4"><a href="/como-funciona" className="rounded-full bg-[#3D1B28] px-6 py-3.5 text-sm font-medium text-[#F7F3EE] shadow-[0_8px_24px_rgba(61,27,40,.16)] transition-all hover:-translate-y-0.5 hover:bg-[#2A121C]">Conhecer a EventeIA <span aria-hidden="true">↗</span></a><a href="/para-planners" className="text-sm font-medium text-[#3D1B28] underline decoration-[#C5A56F] underline-offset-8 transition-colors hover:text-[#C5A56F]">Sou planner</a></div>
        </div>
        <div className="relative lg:pl-6"><div className="relative overflow-hidden rounded-[2rem] border border-[#EEE7DF] bg-[#FFFDFA] p-2 shadow-[0_24px_70px_rgba(61,27,40,.10)]"><img src="/eventeia-wedding.png" alt="Recepção de casamento elegante iluminada por velas" className="aspect-[.92] w-full rounded-[1.5rem] object-cover" /><div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/40 bg-[#FFFDFA]/90 p-4 backdrop-blur-md"><p className="font-serif text-lg text-[#3D1B28]">Você cuida do sonho.</p><p className="mt-1 text-xs text-[#3D1B28]/60">A EventeIA cuida de encontrar o caminho.</p></div></div></div>
      </section>
      <footer className="px-8 pb-8 text-center text-xs text-[#3D1B28]/45"><span className="font-brand">EventeIA</span> — inteligência para eventos extraordinários.</footer>
    </main>
  )
}
