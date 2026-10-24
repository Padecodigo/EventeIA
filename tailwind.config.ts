import type { Config } from "tailwindcss";

/**
 * EventeIA — Design System "Jardim" (v3, out/2026)
 * Nomes históricos dos tokens mantidos; valores novos:
 *   vinho/noite/ink → verde-tinta #13302B (texto; AA em todo fundo claro)
 *   primaria        → esmeralda #0F766E (CTA; texto branco = 5,5:1)
 *   champagne/coral → pêssego #FF9466 (acento; só com texto verde-tinta, 7:1)
 *   champagne-claro → pêssego suave #FFE7DC
 *   coral-escuro    → esmeralda #0F766E (texto de destaque sobre claro, AA)
 *   areia-quente    → #F6FAF7 (fundo) · areia-secundaria → #E3F1EA (faixas)
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
        vinho: "#13302B", // azul-noite (nome histórico mantido)
        "areia-quente": "#F6FAF7",
        "areia-secundaria": "#E3F1EA",
        "off-white": "#FFFFFF",
        champagne: "#FF9466", // coral
        coral: "#FF9466",
        "coral-escuro": "#0F766E", // texto coral sobre claro (AA)
        noite: "#13302B",
        sol: "#FFC94D",
        menta: "#2BB59A",
        lilas: "#8B7CF6",
        "champagne-claro": "#FFE7DC",
        primaria: "#0F766E",
        "primaria-escura": "#0B5E58",
        "verde-claro": "#E3F1EA",

        /* ---- Tokens semânticos (preferidos nos componentes) ---- */
        brand: {
          primary: "#0F766E",
          accent: "#FF9466",
          accentSoft: "#FFE7DC",
        },
        surface: {
          canvas: "#FFFFFF",   // cards, campos
          warm: "#F6FAF7",     // fundo padrão de página
          muted: "#E3F1EA",    // faixas alternadas, linhas de tabela
          dark: "#13302B",     // seções editoriais escuras
        },
        ink: {
          primary: "#13302B",
          inverse: "#FFFFFF",
          accent: "#FF9466",   // apenas sobre azul-noite (contraste AA)
          soft: "#FFE7DC",
        },
        line: {
          subtle: "rgba(19, 48, 43, 0.12)",
          strong: "rgba(19, 48, 43, 0.28)",
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
        soft: "0 1px 2px rgba(19, 48, 43, 0.06), 0 8px 24px rgba(19, 48, 43, 0.06)",
        raised: "0 2px 4px rgba(19, 48, 43, 0.08), 0 16px 40px rgba(19, 48, 43, 0.10)",
        gold: "0 0 0 1px rgba(15, 118, 110, 0.55), 0 8px 24px rgba(15, 118, 110, 0.25)",
      },

      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #FFE7DC 0%, #FF9466 55%, #FFC94D 100%)",
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
