/**
 * Ilustração editorial de festa infantil (balões, bolo e confetes).
 * SVG inline nas cores da marca — evita depender de fotos de banco
 * e mantém o foco no público principal (mães/famílias, festas infantis).
 */
export function KidsPartyIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-labelledby="kids-party-illustration-title"
      className={className}
    >
      <title id="kids-party-illustration-title">
        Ilustração de balões, bolo e confetes de uma festa infantil
      </title>

      {/* Confetes */}
      <g opacity="0.9">
        <rect x="34" y="36" width="8" height="14" rx="2" fill="var(--color-champagne)" transform="rotate(-18 38 43)" />
        <rect x="300" y="58" width="8" height="14" rx="2" fill="var(--color-vinho)" transform="rotate(22 304 65)" />
        <circle cx="316" cy="30" r="4" fill="var(--color-champagne-claro)" />
        <circle cx="58" cy="120" r="4" fill="var(--color-vinho)" />
        <circle cx="270" cy="140" r="5" fill="var(--color-champagne)" />
        <rect x="120" y="30" width="8" height="14" rx="2" fill="var(--color-champagne-claro)" transform="rotate(12 124 37)" />
        <rect x="246" y="24" width="8" height="14" rx="2" fill="var(--color-champagne)" transform="rotate(-26 250 31)" />
      </g>

      {/* Balões */}
      <g>
        <path d="M86 128 q8 34 -6 62" stroke="var(--color-vinho)" strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M132 96 q10 46 -4 88" stroke="var(--color-vinho)" strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M252 108 q-10 42 4 76" stroke="var(--color-vinho)" strokeWidth="1.5" fill="none" opacity="0.5" />

        <ellipse cx="86" cy="86" rx="26" ry="32" fill="var(--color-champagne)" />
        <ellipse cx="132" cy="60" rx="24" ry="30" fill="var(--color-champagne-claro)" />
        <ellipse cx="252" cy="72" rx="27" ry="33" fill="var(--color-vinho)" />

        <path d="M86 118 l-4 8 h8 z" fill="var(--color-champagne)" />
        <path d="M132 90 l-4 8 h8 z" fill="var(--color-champagne-claro)" />
        <path d="M252 105 l-4 8 h8 z" fill="var(--color-vinho)" />
      </g>

      {/* Bolo */}
      <g>
        <rect x="120" y="196" width="124" height="52" rx="12" fill="var(--color-off-white)" stroke="var(--color-vinho)" strokeWidth="2" />
        <rect x="120" y="196" width="124" height="14" rx="7" fill="var(--color-champagne-claro)" />
        <rect x="140" y="160" width="84" height="44" rx="10" fill="var(--color-areia-quente)" stroke="var(--color-vinho)" strokeWidth="2" />
        <path
          d="M140 180 q10 8 20 0 q10 -8 20 0 q10 8 20 0 q10 -8 24 0"
          fill="none"
          stroke="var(--color-champagne)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Velas */}
        <g>
          <rect x="158" y="132" width="6" height="28" rx="2" fill="var(--color-vinho)" />
          <ellipse cx="161" cy="126" rx="4" ry="7" fill="var(--color-champagne)" />
          <rect x="180" y="124" width="6" height="36" rx="2" fill="var(--color-vinho)" />
          <ellipse cx="183" cy="118" rx="4" ry="7" fill="var(--color-champagne)" />
          <rect x="202" y="132" width="6" height="28" rx="2" fill="var(--color-vinho)" />
          <ellipse cx="205" cy="126" rx="4" ry="7" fill="var(--color-champagne)" />
        </g>
      </g>

      {/* Mesa */}
      <path d="M88 252 h188" stroke="var(--color-champagne)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
