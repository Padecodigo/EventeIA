"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV } from "@/lib/admin/nav";

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

export function DashboardNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação do painel"
      className="flex flex-wrap items-center gap-1 text-sm font-medium text-vinho/75"
    >
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
      {isAdmin ? <AdminSection pathname={pathname} /> : null}
    </nav>
  );
}

/** Seção "Admin" exibida só para profiles.role = 'admin'. */
function AdminSection({ pathname }: { pathname: string }) {
  return (
    <div
      role="group"
      aria-label="Admin"
      className="flex flex-wrap items-center gap-1 border-l border-vinho/15 pl-2"
    >
      <Link
        href="/admin"
        aria-current={pathname === "/admin" ? "page" : undefined}
        className="rounded-full bg-champagne/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primaria-escura"
      >
        Admin
      </Link>
      {ADMIN_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
          className="rounded-full px-3 py-2 transition hover:bg-verde-claro hover:text-vinho"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
