import { cookies } from "next/headers";
import Link from "next/link";

import { AdminTopNav } from "@/components/admin/admin-top-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EmailText } from "@/components/ui/email-text";
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
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="font-brand text-2xl">EventeIA</span>
              <span className="rounded-full bg-champagne/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-champagne">
                Admin
              </span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden truncate text-caption text-ink-inverse/50 md:inline">
                <EmailText email={user.email} />
              </span>
              <form action="/admin/busca" method="get" role="search" className="min-w-0">
                <input name="q" type="search" placeholder="Buscar…" aria-label="Busca geral do admin"
                  className="w-28 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-ink-inverse placeholder:text-ink-inverse/50 focus:w-44 focus:outline-none focus:ring-2 focus:ring-champagne sm:w-44" />
              </form>
              <ThemeToggle initial={pref} targetId="admin-root" />
            </div>
          </div>
          <AdminTopNav />
        </div>
      </header>
      {low.length > 0 ? (
        <div role="alert" data-testid="low-balance-banner" className="border-b border-semantic-error/30 bg-semantic-error/10 px-4 py-3 text-sm sm:px-6 text-vinho">
          <div className="mx-auto max-w-6xl">
            <strong>Saldo baixo:</strong>{" "}
            {low.map((l) => `${l.label} ${formatBRL(l.balanceBrlCents)}${l.runwayDays !== null ? ` (~${l.runwayDays.toFixed(1)} dias)` : ""}`).join(" · ")}{" "}
            — <Link href="/admin/custos" className="underline">ver custos</Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
