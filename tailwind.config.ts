import type { Config } from "tailwindcss";

/**
 * EventeIA — Design System "Maison Vinho & Ouro" (v5, out/2026).
 * Nomes históricos dos tokens mantidos; valores:
 *   primaria/vinho → vinho #6B1E2E (CTA com texto branco; hover/dark #4A1420)
 *   champagne/coral → ouro #B8925A (acento; pills com texto escuro) · dourado do logo #B8925A
 *   champagne-claro → ouro-claro #E9D9B8
 *   areia-quente    → marfim #FAF6EF (fundo) · areia-secundaria/verde-claro → linho #F1E9DC (faixas)
 *   noite/ink       → ink #2A1A1D (texto) · muted #6E5F5C (texto secundário)
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
        vinho: "rgb(var(--tr-vinho) / <alpha-value>)", // vinho #6B1E2E
        "areia-quente": "rgb(var(--tr-areia-quente) / <alpha-value>)", // marfim
        "areia-secundaria": "rgb(var(--tr-areia-secundaria) / <alpha-value>)", // linho
        "off-white": "rgb(var(--tr-off-white) / <alpha-value>)",
        champagne: "#B8925A", // ouro
        coral: "#B8925A", // ouro (alias legado)
        "coral-escuro": "#4A1420", // vinho-escuro (texto sobre ouro/claro, AA)
        noite: "#2A1A1D", // ink
        "champagne-claro": "rgb(var(--tr-champagne-claro) / <alpha-value>)", // ouro-claro
        primaria: "rgb(var(--tr-primaria) / <alpha-value>)", // vinho #6B1E2E
        "primaria-escura": "rgb(var(--tr-primaria-escura) / <alpha-value>)", // #4A1420
        "verde-claro": "#F1E9DC", // nome legado; agora linho
        dourado: "#B8925A",
        muted: "#6E5F5C", // texto secundário

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: "#6B1E2E",
          accent: "#B8925A",
          accentSoft: "#E9D9B8",
        },
        surface: {
          canvas: "#FFFFFF",   // cards, campos
          warm: "#FAF6EF",     // fundo padrão de página
          muted: "#F1E9DC",    // faixas alternadas, linhas de tabela
          dark: "#2A1A1D",     // seções editoriais escuras
        },
        ink: {
          primary: "#2A1A1D",
          inverse: "#FFFFFF",
          accent: "#B8925A",   // apenas sobre vinho/ink (contraste AA)
          soft: "#E9D9B8",
          muted: "#6E5F5C",
        },
        line: {
          subtle: "rgb(var(--tr-line-rgb) / 0.12)",
          strong: "rgb(var(--tr-line-rgb) / 0.28)",
        },
        /** Estados semânticos — uso restrito a validação (ícones/labels) */
        semantic: {
          error: "rgb(var(--tr-semantic-error) / <alpha-value>)",
          success: "#2F6B4F",
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
        soft: "0 1px 2px rgba(42, 26, 29, 0.06), 0 8px 24px rgba(42, 26, 29, 0.06)",
        raised: "0 2px 4px rgba(42, 26, 29, 0.08), 0 16px 40px rgba(42, 26, 29, 0.10)",
        gold: "0 0 0 1px rgba(107, 30, 46, 0.55), 0 8px 24px rgba(107, 30, 46, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #E9D9B8 0%, #B8925A 55%, #4A1420 100%)",
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
