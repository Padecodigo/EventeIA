import Image from "next/image";
import Link from "next/link";

import { SiteHeaderMobileMenu } from "@/components/site-header-mobile-menu";

const navItems = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/para-planners", label: "Para planners" },
  { href: "/planos", label: "Planos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-vinho/90 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link prefetch={false} href="/" className="flex cursor-pointer items-center gap-3">
          <Image
            src="/logo-e.png"
            alt="Monograma EventeIA"
            width={120}
            height={67}
            priority
            className="h-9 w-auto shrink-0 object-contain"
          />
          <span className="flex select-none flex-col justify-center">
            <span className="font-brand text-xl leading-none text-off-white sm:text-2xl">EventeIA</span>
            <span className="mt-0.5 hidden text-[9px] font-semibold sm:block uppercase leading-tight tracking-[0.15em] text-off-white/80 sm:text-[10px]">
              Você imagina. A EventeIA faz acontecer.
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav aria-label="Navegação principal" className="hidden items-center gap-1 sm:gap-2 md:flex">
            {navItems.map((item) => (
              <Link prefetch={false}
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-xs font-medium text-off-white/80 underline decoration-transparent underline-offset-4 transition-colors hover:text-champagne hover:decoration-champagne md:text-sm"
              >
                {item.label}
              </Link>
            ))}
            <Link prefetch={false}
              href="/entrar"
              className="px-4 py-2 text-xs font-medium text-off-white/80 underline decoration-transparent underline-offset-4 transition-colors hover:text-champagne hover:decoration-champagne md:text-sm"
            >
              Entrar
            </Link>
            <Link prefetch={false}
              href="/registrar"
              className="rounded-full bg-champagne px-5 py-2 text-xs font-semibold text-noite shadow-sm transition-all hover:bg-champagne-claro active:scale-95 md:text-sm"
            >
              Começar agora
            </Link>
          </nav>
          <SiteHeaderMobileMenu />
        </div>
      </div>
    </header>
  );
}
