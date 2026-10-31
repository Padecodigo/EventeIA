"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

const ITEMS = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/para-planners", label: "Para planners" },
  { href: "/planos", label: "Planos" },
  { href: "/entrar", label: "Entrar" },
] as const;

/** Menu móvel do cabeçalho: botão hambúrguer abaixo de md, fecha em Escape e no clique de link. */
export function SiteHeaderMobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="menu-mobile"
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-full text-off-white transition hover:bg-white/10"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6" aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6" aria-hidden="true">
            <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open ? (
        <nav
          id="menu-mobile"
          aria-label="Menu móvel"
          className="absolute inset-x-0 top-full border-t border-white/10 bg-vinho px-4 py-4 shadow-raised"
        >
          <ul className="flex flex-col gap-1">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  prefetch={false}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-off-white transition hover:bg-white/10"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                prefetch={false}
                href="/registrar"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full bg-champagne px-4 py-3 text-center text-base font-semibold text-noite transition hover:bg-champagne-claro"
              >
                Começar agora
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
