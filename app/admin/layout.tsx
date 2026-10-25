import { cookies } from "next/headers";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EmailText } from "@/components/ui/email-text";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { requireAdmin } from "@/lib/auth";
import { lowBalanceProviders } from "@/lib/finance/balance-banner";
import { formatBRL } from "@/lib/money";
import { THEME_COOKIE, parseThemePreference, themeClass } from "@/lib/theme/palette";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const pref = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  const low = await lowBalanceProviders().catch(() => []);

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
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-inverse/80">
            <Link href="/admin" className="transition hover:text-ink-inverse">
              Início
            </Link>
            {ADMIN_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-ink-inverse">
                {item.label}
              </Link>
            ))}
            <Link href="/painel" className="transition hover:text-ink-inverse">
              Painel do usuário
            </Link>
            <Link href="/" className="transition hover:text-ink-inverse">
              Ver site
            </Link>
            <form action="/admin/busca" method="get" role="search">
              <input name="q" placeholder="Buscar…" aria-label="Busca geral do admin" className="w-32 rounded-full bg-white/10 px-3 py-1 text-sm text-ink-inverse placeholder:text-ink-inverse/50" />
            </form>
            <ThemeToggle initial={pref} targetId="admin-root" />
            <span className="hidden text-caption text-ink-inverse/50 sm:inline">
              <EmailText email={user.email} />
            </span>
          </nav>
        </div>
      </header>
      {low.length > 0 ? (
        <div role="alert" data-testid="low-balance-banner" className="border-b border-semantic-error/30 bg-semantic-error/10 px-6 py-3 text-sm text-vinho">
          <div className="mx-auto max-w-6xl">
            <strong>Saldo baixo:</strong>{" "}
            {low.map((l) => `${l.label} ${formatBRL(l.balanceBrlCents)}${l.runwayDays !== null ? ` (~${l.runwayDays.toFixed(1)} dias)` : ""}`).join(" · ")}{" "}
            — <Link href="/admin/custos" className="underline">ver custos</Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
