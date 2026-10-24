import { Figtree, Fraunces } from "next/font/google";

import type { Metadata } from "next";

import "./globals.css";

/** Títulos: Fraunces (serifa suave, calorosa e premium). Corpo/UI: Figtree (clara e amigável). */
const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
  // Fallback com métricas ajustadas evita salto de layout quando a fonte chega.
  adjustFontFallback: true,
});

/**
 * Itálico da Fraunces só aparece em legendas/rodapé (abaixo do LCP): sem preload,
 * baixa sob demanda quando um trecho itálico é renderizado (ver globals.css).
 */
const displayItalic = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["italic"],
  variable: "--font-display-italic",
  display: "swap",
  preload: false,
});

const body = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "EventeIA — Você imagina. A EventeIA faz acontecer.",
    template: "%s · EventeIA",
  },
  description:
    "A EventeIA pede e compara orçamentos de fornecedores pelo WhatsApp para o seu evento — festa infantil, aniversário, 15 anos, formatura, casamento ou corporativo — e entrega 3 opções: preço, custo-benefício e comodidade.",
  // Favicons: app/icon.png (64px) e app/apple-icon.png (180px) — antes era o logo de 325 KB.
  openGraph: {
    title: "EventeIA",
    description: "Cotamos fornecedores do seu evento pelo WhatsApp e entregamos 3 opções: preço, custo-benefício e comodidade.",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/EventeIA-celebration.png", width: 1376, height: 768 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EventeIA",
    description: "Cotamos fornecedores do seu evento pelo WhatsApp e entregamos 3 opções: preço, custo-benefício e comodidade.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${displayItalic.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
