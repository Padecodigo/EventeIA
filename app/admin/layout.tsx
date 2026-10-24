import { cookies } from "next/headers";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireAdmin } from "@/lib/auth";
import { THEME_COOKIE, parseThemePreference, themeClass } from "@/lib/theme/palette";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const pref = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div id="admin-root" className={`min-h-screen bg-areia-quente text-vinho ${themeClass(pref)}`}>
      <header className="border-b border-line-subtle bg-surface-dark text-ink-inverse">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-brand text-2xl">EventeIA</span>
            <span className="rounded-full bg-champagne/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-champagne">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-ink-inverse/80">
            <Link href="/admin/financeiro" className="transition hover:text-ink-inverse">
              Financeiro
            </Link>
            <Link href="/admin/consumo" className="transition hover:text-ink-inverse">
              Consumo
            </Link>
            <Link href="/admin/depoimentos" className="transition hover:text-ink-inverse">
              Depoimentos
            </Link>
            <Link href="/admin/cupons" className="transition hover:text-ink-inverse">
              Cupons
            </Link>
            <Link href="/painel" className="transition hover:text-ink-inverse">
              Painel
            </Link>
            <Link href="/" className="transition hover:text-ink-inverse">
              Ver site
            </Link>
            <ThemeToggle initial={pref} targetId="admin-root" />
            <span className="hidden text-caption text-ink-inverse/50 sm:inline">{user.email ?? ""}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
