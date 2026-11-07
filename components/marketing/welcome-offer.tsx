import Script from "next/script";

import { welcomeVisitorCopy } from "@/lib/offers/pure";

const WELCOME_COPY = welcomeVisitorCopy();

/**
 * Oferta de boas-vindas nas páginas públicas — Server Component (guarda de TBT: sem React
 * no client). O HTML nasce oculto; /welcome-offer.js (lazyOnload, ~2 KB) consulta
 * /api/boas-vindas e só então revela a faixa com o tempo restante calculado no BANCO.
 * As faixas ficam NO FLUXO (acima do header, sem position fixed/overlay): nunca cobrem menu,
 * CTAs ou conteúdo. Minimizar vira um selo no canto e é lembrado (localStorage).
 */
export function WelcomeOffer() {
  return (
    <>
      <aside
        id="ev-welcome-banner"
        hidden
        aria-label="Oferta de boas-vindas"
        className="relative bg-areia-secundaria text-vinho"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span>{WELCOME_COPY}</span>
          <a
            href="/registrar"
            className="font-semibold text-coral-escuro underline decoration-coral-escuro underline-offset-4"
          >
            Criar conta
          </a>
          <button
            type="button"
            data-welcome-dismiss
            aria-label="Minimizar faixa da oferta"
            className="ml-1 rounded-full px-2 leading-none hover:bg-vinho/10"
          >
            ×
          </button>
        </div>
      </aside>

      {/* Faixa minimizada: selo pequeno no canto (abaixo do z do header), reabre a faixa. */}
      <button
        type="button"
        id="ev-offer-badge"
        hidden
        aria-label="Mostrar oferta de boas-vindas"
        className="fixed bottom-4 left-4 z-30 rounded-full border border-line-subtle bg-areia-secundaria px-3 py-1.5 text-xs font-semibold text-vinho shadow-soft"
      >
        🎁 Oferta
      </button>

      <Script src="/welcome-offer.js" strategy="lazyOnload" />
    </>
  );
}
