import type { Config } from "tailwindcss";

/**
 * EventeIA — Design System "Atelier"
 * Fonte da verdade: .context/DESIGN_SYSTEM.md (não invente tons fora desta paleta).
 *
 * - Cores canônicas + tokens semânticos (use os semânticos nos componentes).
 * - Tipografia: Fraunces (serif/títulos) · DM Sans (sans/UI).
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
        vinho: "#4A2031", // "Vinho Leve" — cor primária oficial
        "areia-quente": "#F7F3EE",
        "areia-secundaria": "#EEE7DF",
        "off-white": "#FFFDFA",
        champagne: "#D4AF37",
        "champagne-claro": "#EADBBD",

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: "#4A2031",
          accent: "#D4AF37",
          accentSoft: "#EADBBD",
        },
        surface: {
          canvas: "#FFFDFA",   // cards, campos
          warm: "#F7F3EE",     // fundo padrão de página
          muted: "#EEE7DF",    // faixas alternadas, linhas de tabela
          dark: "#4A2031",     // seções editoriais escuras
        },
        ink: {
          primary: "#4A2031",
          inverse: "#FFFDFA",
          accent: "#D4AF37",   // apenas sobre vinho (contraste AA)
          soft: "#EADBBD",
        },
        line: {
          subtle: "rgba(74, 32, 49, 0.12)",
          strong: "rgba(74, 32, 49, 0.28)",
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
        brand: ["var(--font-bodoni)", "Bodoni Moda", "Didot", "Times New Roman", "serif"],
        serif: ["Fraunces", "Georgia", "Times New Roman", "serif"],
        sans: [
          "DM Sans",
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
        /* Fraunces 600 = títulos; DM Sans 400/500 = corpo/UI */
        display: "600",
      },

      /* ======================================================
       * RITMO VISUAL
       * ====================================================== */
      borderRadius: {
        card: "1rem",
        pill: "999px",
      },

      boxShadow: {
        soft: "0 1px 2px rgba(74, 32, 49, 0.06), 0 8px 24px rgba(74, 32, 49, 0.06)",
        raised: "0 2px 4px rgba(74, 32, 49, 0.08), 0 16px 40px rgba(74, 32, 49, 0.10)",
        gold: "0 0 0 1px rgba(197, 165, 111, 0.55), 0 8px 24px rgba(197, 165, 111, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #EADBBD 0%, #D4AF37 50%, #EADBBD 100%)",
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
