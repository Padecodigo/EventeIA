"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const DASHBOARD_NAV = [
  { href: "/painel", label: "Painel" },
  { href: "/eventos", label: "Eventos" },
  { href: "/creditos", label: "Créditos" },
  { href: "/chamados", label: "Chamados" },
  { href: "/perfil", label: "Perfil" },
] as const;

/** Verdadeiro quando `pathname` está na seção `href` (ex.: /eventos/123 → Eventos). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação do painel" className="flex items-center gap-1 text-sm font-medium text-vinho/75">
      {DASHBOARD_NAV.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-champagne-claro px-4 py-2 font-semibold text-primaria-escura"
                : "rounded-full px-4 py-2 transition hover:bg-verde-claro hover:text-vinho"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
