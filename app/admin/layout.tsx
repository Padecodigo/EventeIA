import Link from "next/link";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-areia-quente text-vinho">
      <header className="border-b border-line-subtle bg-vinho text-off-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-brand text-2xl">EventeIA</span>
            <span className="rounded-full bg-champagne/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-champagne">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-off-white/80">
            <Link href="/admin/financeiro" className="transition hover:text-off-white">
              Financeiro
            </Link>
            <Link href="/admin/depoimentos" className="transition hover:text-off-white">
              Depoimentos
            </Link>
            <Link href="/admin/cupons" className="transition hover:text-off-white">
              Cupons
            </Link>
            <Link href="/painel" className="transition hover:text-off-white">
              Painel
            </Link>
            <Link href="/" className="transition hover:text-off-white">
              Ver site
            </Link>
            <span className="hidden text-caption text-off-white/50 sm:inline">{user.email ?? ""}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
