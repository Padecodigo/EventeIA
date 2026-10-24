import Image from "next/image";
import Link from "next/link";

const navItems = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/para-planners", label: "Para planners" },
  { href: "/planos", label: "Planos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line-subtle bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="flex cursor-pointer items-center gap-3" aria-label="EventeIA — início">
          <Image
            src="/logo-e.png"
            alt="Monograma EventeIA"
            width={120}
            height={67}
            priority
            className="h-9 w-auto shrink-0 object-contain"
          />
          <span className="flex select-none flex-col justify-center">
            <span className="font-brand text-xl leading-none text-vinho sm:text-2xl">EventeIA</span>
            <span className="mt-0.5 hidden text-[9px] font-semibold sm:block uppercase leading-tight tracking-[0.15em] text-vinho/70 sm:text-[10px]">
              Você imagina. A EventeIA faz acontecer.
            </span>
          </span>
        </Link>

        <nav aria-label="Navegação principal" className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hidden px-4 py-2 text-xs font-medium text-vinho underline decoration-transparent underline-offset-4 transition-colors hover:decoration-primaria sm:block sm:text-sm"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/entrar"
            className="hidden px-4 py-2 text-xs font-medium text-vinho underline decoration-transparent underline-offset-4 transition-colors hover:decoration-primaria sm:block sm:text-sm"
          >
            Entrar
          </Link>
          <Link
            href="/registrar"
            className="rounded-full bg-primaria px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-primaria-escura active:scale-95 sm:text-sm"
          >
            Começar agora
          </Link>
        </nav>
      </div>
    </header>
  );
}
