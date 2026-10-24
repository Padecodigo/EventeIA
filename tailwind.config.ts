import type { Config } from "tailwindcss";

/**
 * EventeIA — Design System "Terra Rosé" (v4, out/2026) — derivado do monograma dourado/terra do logo.
 * Nomes históricos dos tokens mantidos; valores:
 *   vinho/noite/ink → cacau #3B2420 (texto; 13:1 no fundo)
 *   primaria        → vinho-rosé #A3485A (CTA; texto branco 5,8:1) · primaria-escura #86374A
 *   champagne/coral → blush-terracota #E8A587 (acento; só com texto cacau, 7:1)
 *   champagne-claro → blush #F6E1D8 · terracota #C9734F (decorativo) · dourado do logo #BF986B
 *   areia-quente    → #FBF6F2 (fundo) · areia-secundaria/verde-claro → #F3E6DD (faixas)
 * Tipografia: Fraunces (títulos) · Figtree (corpo/UI).
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
        vinho: "rgb(var(--tr-vinho) / <alpha-value>)", // azul-noite (nome histórico mantido)
        "areia-quente": "rgb(var(--tr-areia-quente) / <alpha-value>)",
        "areia-secundaria": "rgb(var(--tr-areia-secundaria) / <alpha-value>)",
        "off-white": "rgb(var(--tr-off-white) / <alpha-value>)",
        champagne: "#E8A587", // coral
        coral: "#E8A587",
        "coral-escuro": "#A3485A", // texto coral sobre claro (AA)
        noite: "#3B2420",
        sol: "#FFC94D",
        menta: "#C9734F",
        lilas: "#8B7CF6",
        "champagne-claro": "rgb(var(--tr-champagne-claro) / <alpha-value>)",
        primaria: "rgb(var(--tr-primaria) / <alpha-value>)",
        "primaria-escura": "rgb(var(--tr-primaria-escura) / <alpha-value>)",
        "verde-claro": "#F3E6DD", // nome legado; agora areia-rosé
        terracota: "#C9734F",
        dourado: "#BF986B",

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: "#A3485A",
          accent: "#E8A587",
          accentSoft: "#F6E1D8",
        },
        surface: {
          canvas: "#FFFFFF",   // cards, campos
          warm: "#FBF6F2",     // fundo padrão de página
          muted: "#F3E6DD",    // faixas alternadas, linhas de tabela
          dark: "#3B2420",     // seções editoriais escuras
        },
        ink: {
          primary: "#3B2420",
          inverse: "#FFFFFF",
          accent: "#E8A587",   // apenas sobre azul-noite (contraste AA)
          soft: "#F6E1D8",
        },
        line: {
          subtle: "rgb(var(--tr-line-rgb) / 0.12)",
          strong: "rgb(var(--tr-line-rgb) / 0.28)",
        },
        /** Estados semânticos — uso restrito a validação (ícones/labels) */
        semantic: {
          error: "rgb(var(--tr-semantic-error) / <alpha-value>)",
          success: "#1E6B3A",
        },
      },

      /* ======================================================
       * TIPOGRAFIA
       * ====================================================== */
      fontFamily: {
        /* Wordmark da marca: Bodoni Moda (exceção editorial — ver DESIGN_SYSTEM.md §4.1) */
        brand: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
        /* "serif" mantido como nome do token de títulos; agora é a display arredondada */
        serif: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
        display: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
        /* acento manuscrito (uma ou duas palavras por seção, nunca texto corrido) */
        script: ["var(--font-display)", "Georgia", "serif"],
        sans: [
          "var(--font-body)",
          "Figtree",
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
        /* Fraunces 600 = títulos; Figtree 400/500 = corpo/UI */
        display: "600",
      },

      /* ======================================================
       * RITMO VISUAL
       * ====================================================== */
      borderRadius: {
        card: "1.25rem",
        pill: "999px",
      },

      boxShadow: {
        soft: "0 1px 2px rgba(59, 36, 32, 0.06), 0 8px 24px rgba(59, 36, 32, 0.06)",
        raised: "0 2px 4px rgba(59, 36, 32, 0.08), 0 16px 40px rgba(59, 36, 32, 0.10)",
        gold: "0 0 0 1px rgba(163, 72, 90, 0.55), 0 8px 24px rgba(163, 72, 90, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #F6E1D8 0%, #E8A587 55%, #FFC94D 100%)",
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
