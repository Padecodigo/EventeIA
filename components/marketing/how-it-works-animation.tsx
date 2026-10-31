import { PALETTE as P } from "@/lib/design/palette";

/**
 * Animação leve (SVG + CSS, sem JS) dos 3 passos do cliente — loop de 9 s.
 * 1) conte seu evento · 2) a EventeIA busca e compara · 3) você recebe o orçamento pronto.
 * Com prefers-reduced-motion mostra só o passo 3 (estático). Keyframes em app/globals.css (ev-how-*).
 */
const STEP_LABELS = ["Conte seu evento", "A EventeIA busca e compara", "Você recebe o orçamento pronto"] as const;

export function HowItWorksAnimation() {
  return (
    <figure className="ev-how mx-auto w-full max-w-md" data-testid="como-funciona-animacao">
      <svg viewBox="0 0 360 260" role="img" aria-labelledby="ev-how-title" className="h-auto w-full">
        <title id="ev-how-title">
          Animação: você conta seu evento pelo celular, a EventeIA compara orçamentos de fornecedores e você recebe o orçamento pronto.
        </title>
        <rect width="360" height="260" rx="28" fill={P.areiaSecundaria} />

        {/* 1 — celular com chat/formulário */}
        <g className="ev-how-scene ev-how-s1">
          <rect x="125" y="22" width="110" height="216" rx="18" fill={P.ink} />
          <rect x="132" y="34" width="96" height="192" rx="12" fill={P.offWhite} />
          <rect className="ev-how-msg ev-how-m1" x="140" y="48" width="70" height="18" rx="9" fill={P.champagneClaro} />
          <rect className="ev-how-msg ev-how-m2" x="150" y="74" width="70" height="18" rx="9" fill={P.primaria} />
          <rect className="ev-how-msg ev-how-m3" x="140" y="100" width="62" height="18" rx="9" fill={P.champagneClaro} />
          <g className="ev-how-msg ev-how-m4">
            <rect x="140" y="130" width="80" height="12" rx="6" fill={P.areiaSecundaria} />
            <rect x="140" y="148" width="80" height="12" rx="6" fill={P.areiaSecundaria} />
            <rect x="140" y="166" width="56" height="12" rx="6" fill={P.areiaSecundaria} />
            <rect x="140" y="194" width="80" height="20" rx="10" fill={P.coralEscuro} />
          </g>
        </g>

        {/* 2 — cards de fornecedores sendo comparados; preços se ordenam */}
        <g className="ev-how-scene ev-how-s2">
          {[
            { y: 40, w: 150, cls: "ev-how-c1" },
            { y: 104, w: 90, cls: "ev-how-c2" },
            { y: 168, w: 120, cls: "ev-how-c3" },
          ].map((c) => (
            <g key={c.cls} className={`ev-how-card ${c.cls}`}>
              <rect x="40" y={c.y} width="280" height="52" rx="14" fill={P.offWhite} />
              <circle cx="66" cy={c.y + 26} r="12" fill={P.tealSoft} />
              <rect x="88" y={c.y + 14} width="80" height="9" rx="4.5" fill={P.areiaSecundaria} />
              <rect x="88" y={c.y + 30} width={c.w} height="9" rx="4.5" fill={P.primaria} />
            </g>
          ))}
        </g>

        {/* 3 — orçamento pronto com total e check */}
        <g className="ev-how-scene ev-how-s3">
          <rect x="70" y="30" width="220" height="200" rx="18" fill={P.offWhite} />
          <rect x="92" y="52" width="110" height="12" rx="6" fill={P.ink} />
          <rect x="92" y="80" width="176" height="9" rx="4.5" fill={P.areiaSecundaria} />
          <rect x="92" y="98" width="150" height="9" rx="4.5" fill={P.areiaSecundaria} />
          <rect x="92" y="116" width="164" height="9" rx="4.5" fill={P.areiaSecundaria} />
          <line x1="92" y1="140" x2="268" y2="140" stroke={P.champagneClaro} strokeWidth="2" />
          <rect x="92" y="154" width="60" height="12" rx="6" fill={P.ink} />
          <rect x="196" y="152" width="72" height="16" rx="8" fill={P.coralEscuro} />
          <circle cx="180" cy="200" r="18" fill={P.teal} />
          <path className="ev-how-check" d="M171 200l6 6 12-13" fill="none" stroke={P.offWhite} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      <figcaption>
        <ol className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px] font-semibold leading-tight text-vinho/60 sm:text-[13px]">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={`ev-how-label ev-how-l${i + 1} rounded-full px-2 py-1.5`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
