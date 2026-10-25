import Script from "next/script";

import { formatBRL } from "@/lib/money";
import { welcomeVisitorCopy } from "@/lib/offers/pure";

const WELCOME_COPY = welcomeVisitorCopy();

/**
 * Oferta de boas-vindas nas páginas públicas — Server Component (guarda de TBT: sem React
 * no client). O HTML nasce oculto; /welcome-offer.js (lazyOnload, ~2 KB) consulta
 * /api/boas-vindas e só então revela faixa/modal com o tempo restante calculado no BANCO.
 */
function prices(): { full: number } | null {
  const full = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");
  return Number.isInteger(full) && full > 0 ? { full } : null;
}

export function WelcomeOffer() {
  const p = prices();
  if (p === null) {
    return null;
  }
  return (
    <>
      <aside
        id="ev-welcome-banner"
        hidden
        aria-label="Oferta de boas-vindas"
        className="fixed inset-x-0 top-0 z-[60] bg-vinho text-off-white shadow-raised"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span>{WELCOME_COPY}</span>
          <a
            href="/registrar"
            className="font-semibold underline decoration-champagne underline-offset-4"
          >
            Criar conta
          </a>
          <button
            type="button"
            data-welcome-dismiss
            aria-label="Fechar faixa da oferta"
            className="ml-1 rounded-full px-2 leading-none hover:bg-off-white/10"
          >
            ×
          </button>
        </div>
      </aside>

      {/* Cupom sorteado ("Quer cupom?"): só aparece quando a oferta de boas-vindas já não está
          ativa (expirada/usada) — o script nunca revela as duas. Sorteio 100% no servidor. */}
      <aside
        id="ev-lucky-banner"
        hidden
        aria-label="Cupom sorteado"
        className="fixed inset-x-0 top-0 z-[60] bg-vinho text-off-white shadow-raised"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span data-lucky-teaser>Ainda dá tempo de economizar no seu tíquete.</span>
          <button
            type="button"
            data-lucky-draw
            className="rounded-full bg-champagne px-4 py-1 font-semibold text-vinho shadow-soft transition hover:scale-105"
          >
            Quer cupom? 🎁
          </button>
          <span data-lucky-summary hidden>
            Seu cupom: <strong data-lucky-percent className="text-champagne" />% off ·{" "}
            <strong data-lucky-final className="text-champagne" /> · expira em{" "}
            <time data-lucky-countdown className="font-semibold tabular-nums text-champagne">
              --:--:--
            </time>
          </span>
          <button
            type="button"
            data-lucky-dismiss
            aria-label="Fechar faixa do cupom"
            className="ml-1 rounded-full px-2 leading-none hover:bg-off-white/10"
          >
            ×
          </button>
        </div>
      </aside>

      <dialog
        id="ev-lucky-modal"
        aria-labelledby="lucky-title"
        className="w-[min(92vw,28rem)] rounded-card bg-off-white p-0 text-vinho shadow-raised backdrop:bg-vinho/50"
      >
        <div className="p-7 text-center">
          <p className="eyebrow">Cupom sorteado</p>
          <h2 id="lucky-title" className="mt-2 font-serif text-title-1">
            Seu desconto é de…
          </h2>
          <p className="mt-4 font-serif text-display-2 tabular-nums" aria-live="polite">
            <span data-lucky-roll>??</span>%
          </p>
          <div data-lucky-result hidden>
            <p className="mt-2 flex items-baseline justify-center gap-3">
              <s className="text-vinho/70">{formatBRL(p.full)}</s>
              <span data-lucky-final className="font-serif text-title-1" />
            </p>
            <p
              className="mt-3 inline-block rounded-xl border-2 border-dashed border-vinho/40 px-4 py-2 font-mono text-sm tracking-widest"
              data-lucky-code
            />
            <p className="mt-4 rounded-xl bg-areia-secundaria px-4 py-3 text-sm">
              Válido no tíquete único por{" "}
              <time data-lucky-countdown className="font-semibold tabular-nums">
                --:--:--
              </time>
              . O prazo não reinicia e o sorteio não se repete.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href="/registrar"
                className="rounded-full bg-primaria px-5 py-3 text-sm font-semibold text-white hover:bg-primaria-escura"
              >
                Usar meu cupom
              </a>
              <button
                type="button"
                data-lucky-close
                className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium"
              >
                Depois
              </button>
            </div>
            <p className="mt-4 text-caption text-vinho/70">
              Aplicado automaticamente no checkout. 1 por pessoa, aparelho e conta.
            </p>
          </div>
        </div>
      </dialog>

      <Script src="/welcome-offer.js" strategy="lazyOnload" />
    </>
  );
}

/** Selo no card do tíquete em /planos: a oferta real, sem contagem para visitantes. */
export function WelcomePlanosNote() {
  return (
    <div id="ev-welcome-planos" className="mt-4 rounded-xl bg-vinho px-4 py-3 text-sm text-off-white">
      <p>{WELCOME_COPY}</p>
      <p className="mt-1 text-caption opacity-90">
        O prazo de 48h começa no seu primeiro acesso e é controlado pelo servidor.
      </p>
    </div>
  );
}
