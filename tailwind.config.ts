import type { Config } from "tailwindcss";

/**
 * EventeIA — Design System "Festa Clara" (v2, out/2026)
 * Fonte da verdade: .context/DESIGN_SYSTEM.md.
 *
 * Os NOMES históricos dos tokens (vinho, champagne, areia…) foram mantidos para
 * não quebrar o painel e as demais páginas; os VALORES mudaram:
 *   vinho          → azul-noite profundo #2B1E1A (texto/primária — confiança, AA em todo fundo claro)
 *   champagne      → coral #FF7A45 (CTA e destaques; texto azul-noite sobre coral = 5,6:1)
 *   champagne-claro→ pêssego #FFE1D1
 *   areia-quente   → creme #FFF8F1 · areia-secundaria → #FDEEE3 · off-white → #FFFFFF
 * Novos acentos decorativos: sol #FFC94D, menta #2BB59A, lilas #8B7CF6 (nunca como texto pequeno).
 * - Tipografia: Plus Jakarta Sans (display) · Inter (corpo/UI).
 * - O produto é light-first; dark mode não faz parte do DS v1.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
    "./workers/**/*.{ts,tsx}",
  ],

  darkMode: "class",

  theme: {
    extend: {
      /* ======================================================
       * CORES — paleta oficial + tokens semânticos
       * ====================================================== */
      colors: {
        /* ---- Paleta canônica (hex oficial) ---- */
        vinho: "#2B1E1A", // azul-noite (nome histórico mantido)
        "areia-quente": "#FFF8F1",
        "areia-secundaria": "#FDEEE3",
        "off-white": "#FFFFFF",
        champagne: "#FF7A45", // coral
        coral: "#FF7A45",
        "coral-escuro": "#C2410C", // texto coral sobre claro (AA)
        noite: "#2B1E1A",
        sol: "#FFC94D",
        menta: "#2BB59A",
        lilas: "#8B7CF6",
        "champagne-claro": "#FFE1D1",

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: "#2B1E1A",
          accent: "#FF7A45",
          accentSoft: "#FFE1D1",
        },
        surface: {
          canvas: "#FFFFFF",   // cards, campos
          warm: "#FFF8F1",     // fundo padrão de página
          muted: "#FDEEE3",    // faixas alternadas, linhas de tabela
          dark: "#2B1E1A",     // seções editoriais escuras
        },
        ink: {
          primary: "#2B1E1A",
          inverse: "#FFFFFF",
          accent: "#FF7A45",   // apenas sobre azul-noite (contraste AA)
          soft: "#FFE1D1",
        },
        line: {
          subtle: "rgba(30, 42, 74, 0.12)",
          strong: "rgba(30, 42, 74, 0.28)",
        },
        /** Estados semânticos — uso restrito a validação (ícones/labels) */
        semantic: {
          error: "#B3261E",
          success: "#1E6B3A",
        },
      },

      /* ======================================================
       * TIPOGRAFIA
       * ====================================================== */
      fontFamily: {
        /* Wordmark da marca: Bodoni Moda (exceção editorial — ver DESIGN_SYSTEM.md §4.1) */
        brand: ["var(--font-display)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        /* "serif" mantido como nome do token de títulos; agora é a display arredondada */
        serif: ["var(--font-display)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        /* acento manuscrito (uma ou duas palavras por seção, nunca texto corrido) */
        script: ["var(--font-script)", "cursive"],
        sans: [
          "var(--font-body)",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
      },

      fontSize: {
        "display-1": ["4rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-2": ["3rem", { lineHeight: "1.10", letterSpacing: "-0.015em" }],
        "title-1": ["2rem", { lineHeight: "1.20", letterSpacing: "-0.01em" }],
        "title-2": ["1.5rem", { lineHeight: "1.30", letterSpacing: "-0.005em" }],
        "title-3": ["1.25rem", { lineHeight: "1.40" }],
        "body-lg": ["1.125rem", { lineHeight: "1.60" }],
        body: ["1rem", { lineHeight: "1.60" }],
        caption: ["0.8125rem", { lineHeight: "1.50" }],
        overline: ["0.75rem", { lineHeight: "1.40", letterSpacing: "0.14em" }],
      },

      letterSpacing: {
        tight: "-0.02em",
        editorial: "0.02em",
      },

      fontWeight: {
        /* Plus Jakarta Sans 800 = títulos; Inter 400/500 = corpo/UI */
        display: "800",
      },

      /* ======================================================
       * RITMO VISUAL
       * ====================================================== */
      borderRadius: {
        card: "1rem",
        pill: "999px",
      },

      boxShadow: {
        soft: "0 1px 2px rgba(30, 42, 74, 0.06), 0 8px 24px rgba(30, 42, 74, 0.06)",
        raised: "0 2px 4px rgba(30, 42, 74, 0.08), 0 16px 40px rgba(30, 42, 74, 0.10)",
        gold: "0 0 0 1px rgba(255, 122, 69, 0.55), 0 8px 24px rgba(255, 122, 69, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #FFE1D1 0%, #FF7A45 50%, #FFC94D 100%)",
      },

      transitionTimingFunction: {
        editorial: "cubic-bezier(0.2, 0, 0, 1)",
      },

      transitionDuration: {
        editorial: "200ms",
      },

      maxWidth: {
        prose: "65ch",
      },
    },
  },

  plugins: [],
};

export default config;
