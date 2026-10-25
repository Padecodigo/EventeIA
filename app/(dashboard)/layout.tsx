import Image from "next/image";
import Link from "next/link";

import type { ReactNode } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { OfferBanner } from "@/components/domain/offer-banner";
import { NotificationsPoller } from "@/components/notifications/notifications-poller";
import { SupportButton } from "@/components/support/support-button";
import { isAdminUser, requireUser } from "@/lib/auth";
import { offerHeadline } from "@/lib/offers/pure";
import { activeUserOffer, startWelcomeOffer } from "@/lib/offers/server";
import { bindWelcomeOfferToUser } from "@/lib/welcome/server";

import { signOutAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Vínculo da oferta de boas-vindas no 1º acesso autenticado — cobre cadastro via Google OAuth
  // (/auth/callback redireciona para cá) sem depender do caminho de criação do perfil.
  await bindWelcomeOfferToUser(user.id);
  const isAdmin = await isAdminUser(user.id);
  // 1º acesso logado inicia a janela de 48h no BANCO (idempotente; contas antigas
  // começam agora, no próximo acesso). Recarregar/trocar de aparelho não reinicia.
  await startWelcomeOffer(user.id);
  const offer = await activeUserOffer(user.id);

  return (
    <div className="min-h-screen bg-[radial-gradient(60%_40%_at_100%_0%,#F3E6DD,transparent)] bg-areia-quente text-vinho">
      <header className="sticky top-0 z-40 border-b border-line-subtle bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/painel" className="flex items-center gap-3">
            <Image
              src="/logo-e.png"
              alt="EventeIA"
              width={120}
              height={67}
              priority
              className="h-9 w-auto object-contain"
            />
            <span className="font-brand text-xl leading-none text-vinho sm:text-2xl">EventeIA</span>
          </Link>

          <DashboardNav isAdmin={isAdmin} />

          <div className="flex items-center gap-4">
            <span className="hidden text-caption text-vinho/70 sm:inline">{user.email ?? ""}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-full border border-vinho/15 bg-white px-4 py-2 text-sm font-semibold text-vinho transition hover:border-primaria/40 hover:bg-verde-claro/50"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {offer !== null ? (
        <div className="mx-auto w-full max-w-6xl px-6 pt-6">
          <OfferBanner
            headline={offerHeadline(offer.kind, offer)}
            remainingMs={offer.remainingMs}
          />
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
      <footer className="border-t border-line-subtle py-6 text-center text-[11px] text-vinho/60">
        © {new Date().getFullYear()} EventeIA · Pagamentos via Pix e cartão · Dados protegidos
        (LGPD)
      </footer>
      <NotificationsPoller />
      <SupportButton />
    </div>
  );
}
