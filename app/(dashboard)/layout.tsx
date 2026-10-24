import Image from "next/image";
import Link from "next/link";

import type { ReactNode } from "react";

import { NotificationsPoller } from "@/components/notifications/notifications-poller";
import { requireUser } from "@/lib/auth";

import { signOutAction } from "./actions";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/painel", label: "Painel" },
  { href: "/eventos", label: "Eventos" },
  { href: "/creditos", label: "Créditos" },
  { href: "/perfil", label: "Perfil" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-areia-quente text-vinho">
      <header className="border-b border-line-subtle bg-off-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/painel" className="flex items-center gap-3">
            <Image src="/logo-e.png" alt="EventeIA" width={32} height={32} priority />
            <span className="font-serif text-lg font-semibold tracking-editorial">EventeIA</span>
          </Link>

          <nav className="flex items-center gap-6 text-sm text-vinho/75">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-vinho">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <span className="hidden text-caption text-vinho/70 sm:inline">{user.email ?? ""}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-xl border border-line-subtle px-4 py-2 text-sm text-vinho/80 transition hover:bg-areia-quente"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
      <NotificationsPoller />
    </div>
  );
}
