"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV } from "@/lib/admin/nav";

const LINKS = [{ href: "/admin", label: "Início" }, ...ADMIN_NAV, { href: "/painel", label: "Painel do usuário" }, { href: "/", label: "Ver site" }];

/** Menu do admin: uma linha rolável no celular, quebra em várias linhas no computador. Destaca a seção atual. */
export function AdminTopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do admin" className="-mx-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap px-4 pb-1 text-sm [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible">
      {LINKS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : item.href !== "/" && item.href !== "/painel" && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={active
              ? "shrink-0 rounded-full bg-champagne px-3 py-1.5 font-semibold text-vinho"
              : "shrink-0 rounded-full px-3 py-1.5 text-ink-inverse/80 transition hover:bg-white/10 hover:text-ink-inverse"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
