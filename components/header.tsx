import type { FC } from "react"

const Header: FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#EEE7DF] bg-[#F7F3EE]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
        <a href="#inicio" className="flex cursor-pointer items-center gap-3" aria-label="Eventeia — início">
          <img src="/logo-e.png" alt="Eventeia Logo" className="h-9 w-auto shrink-0 object-contain" />
          <span className="flex select-none flex-col justify-center">
            <span className="font-serif text-xl font-bold leading-none tracking-tight text-[#3D1B28] sm:text-2xl">Eventeia</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase leading-tight tracking-[0.15em] text-[#C5A56F] sm:text-[10px]">Você imagina. A Eventeia faz acontecer.</span>
          </span>
        </a>

        <nav aria-label="Navegação principal" className="flex items-center gap-1 sm:gap-2">
          <a href="#entrar" className="hidden px-4 py-2 text-xs font-medium text-[#3D1B28] transition-colors hover:text-[#C5A56F] sm:block sm:text-sm">Entrar</a>
          <a href="#comecar" className="rounded-full bg-[#3D1B28] px-5 py-2 text-xs font-medium tracking-wide text-[#F7F3EE] shadow-sm transition-all hover:bg-[#2A121C] active:scale-95 sm:text-sm">Começar agora</a>
          <button type="button" aria-label="Abrir menu" className="rounded-lg p-2 text-[#3D1B28] transition-colors hover:bg-[#EEE7DF]/50 sm:hidden">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header
