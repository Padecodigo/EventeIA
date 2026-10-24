import Link from "next/link";

/** Rodapé único do site (marketing e autenticação). */
export function SiteFooter() {
  return (
  <footer className="bg-vinho text-off-white">
    <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.2fr_0.8fr]">
      <div>
        <p className="font-brand text-3xl">EventeIA</p>
        <p className="mt-3 font-serif text-xl italic text-[#E8A587]">
          Você imagina. A EventeIA faz acontecer.
        </p>
        <p className="mt-4 max-w-md text-sm leading-7 text-off-white/70">
          A clareza financeira e a inteligência que o seu evento merece — para festas de todos os
          tamanhos, com transparência de ponta a ponta.
        </p>
      </div>

      <nav aria-label="Rodapé" className="grid grid-cols-2 gap-6 text-sm">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-champagne">
            Navegar
          </p>
          <Link prefetch={false} href="/como-funciona" className="text-off-white/70 transition hover:text-off-white">
            Como funciona
          </Link>
          <Link prefetch={false} href="/para-planners" className="text-off-white/70 transition hover:text-off-white">
            Para planners
          </Link>
          <Link prefetch={false} href="/planos" className="text-off-white/70 transition hover:text-off-white">
            Planos
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-champagne">
            Conta
          </p>
          <Link prefetch={false} href="/entrar" className="text-off-white/70 transition hover:text-off-white">
            Entrar
          </Link>
          <Link prefetch={false} href="/registrar" className="text-off-white/70 transition hover:text-off-white">
            Criar conta
          </Link>
          <span className="text-off-white/70">Privacidade e LGPD em breve</span>
        </div>
      </nav>
    </div>

    <div className="border-t border-off-white/10 px-4 py-6 text-center text-[11px] text-off-white/70 sm:px-8">
      © {new Date().getFullYear()} EventeIA · Pagamentos via Pix e cartão · Dados protegidos
      (LGPD)
    </div>
  </footer>
  );
}
