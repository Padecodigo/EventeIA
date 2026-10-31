import type { Config } from "tailwindcss";

import { PALETTE } from "./lib/design/palette";

/**
 * EventeIA — Design System "Areia & Coral" (v5, out/2026).
 * Nomes históricos dos tokens mantidos; valores novos (fonte: lib/design/palette.ts):
 *   vinho/noite/ink → charcoal #2B2724 (texto; 13,3:1 no fundo areia)
 *   primaria        → coral-terracota #F0A070 (CTA; texto charcoal 7,0:1) · primaria-escura #E88B55 (5,8:1)
 *   champagne/coral → #F0A070 (acento preenchido; texto charcoal) · champagne-claro #FBE3D3
 *   coral-escuro    → terracota profundo #A4481F (texto de acento sobre claro)
 *   teal/teal-soft  → #38706A / #D7E7E3 (secundário frio, badges, anel de foco)
 *   terracota #D9784A (decorativo) · dourado do logo #BF986B (somente logo)
 *   areia-quente #F7F2EA (fundo) · areia-secundaria/verde-claro #EEE5D6 (faixas)
 *   surface.dark #2B2724 (seções editoriais escuras; texto inverso branco)
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
        vinho: "rgb(var(--tr-vinho) / <alpha-value>)", // charcoal (nome histórico mantido)
        "areia-quente": "rgb(var(--tr-areia-quente) / <alpha-value>)",
        "areia-secundaria": "rgb(var(--tr-areia-secundaria) / <alpha-value>)",
        "off-white": "rgb(var(--tr-off-white) / <alpha-value>)",
        champagne: PALETTE.champagne,
        coral: PALETTE.champagne,
        "coral-escuro": PALETTE.coralEscuro, // texto de acento sobre claro (AA)
        noite: PALETTE.ink,
        sol: PALETTE.sol,
        menta: PALETTE.terracota,
        lilas: "#8B7CF6",
        "champagne-claro": "rgb(var(--tr-champagne-claro) / <alpha-value>)",
        primaria: "rgb(var(--tr-primaria) / <alpha-value>)",
        "primaria-escura": "rgb(var(--tr-primaria-escura) / <alpha-value>)",
        "verde-claro": PALETTE.areiaSecundaria, // nome legado; agora areia
        terracota: PALETTE.terracota,
        dourado: PALETTE.dourado,
        teal: PALETTE.teal,
        "teal-soft": PALETTE.tealSoft,
        /* Texto sobre primaria/champagne: charcoal fixo (não inverte no tema escuro). */
        "on-primary": PALETTE.onPrimary,

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: PALETTE.primaria,
          accent: PALETTE.champagne,
          accentSoft: PALETTE.champagneClaro,
        },
        surface: {
          canvas: PALETTE.offWhite,          // cards, campos
          warm: PALETTE.areiaQuente,         // fundo padrão de página
          muted: PALETTE.areiaSecundaria,    // faixas alternadas, linhas de tabela
          dark: PALETTE.surfaceDark,         // seções editoriais escuras
        },
        ink: {
          primary: PALETTE.ink,
          inverse: PALETTE.offWhite,
          accent: PALETTE.champagne,         // apenas sobre superfícies escuras (contraste AA)
          soft: PALETTE.champagneClaro,
          onPrimary: PALETTE.onPrimary,
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
        soft: "0 1px 2px rgba(43, 39, 36, 0.06), 0 8px 24px rgba(43, 39, 36, 0.06)",
        raised: "0 2px 4px rgba(43, 39, 36, 0.08), 0 16px 40px rgba(43, 39, 36, 0.10)",
        gold: "0 0 0 1px rgba(240, 160, 112, 0.55), 0 8px 24px rgba(240, 160, 112, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #FBE3D3 0%, #F0A070 55%, #D7E7E3 100%)",
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
