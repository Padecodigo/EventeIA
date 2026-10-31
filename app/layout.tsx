import localFont from "next/font/local";

import type { Metadata } from "next";

import { AnalyticsTracker } from "@/components/analytics/tracker";
import { OG_IMAGE, SEO_KEYWORDS, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/seo/site";

import "./globals.css";

/** Títulos: Fraunces (serifa suave, calorosa e premium). Corpo/UI: Figtree (clara e amigável). */
const display = localFont({
  src: [{ path: "./fonts/Fraunces.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  // Fallback com métricas ajustadas evita salto de layout quando a fonte chega.
  adjustFontFallback: "Times New Roman",
});

/**
 * Itálico da Fraunces só aparece em legendas/rodapé (abaixo do LCP): sem preload,
 * baixa sob demanda quando um trecho itálico é renderizado (ver globals.css).
 */
const displayItalic = localFont({
  src: [{ path: "./fonts/Fraunces-Italic.woff2", weight: "100 900", style: "italic" }],
  variable: "--font-display-italic",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const body = localFont({
  src: [{ path: "./fonts/Figtree.woff2", weight: "300 900", style: "normal" }],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "EventeIA — Fornecedores e orçamento pronto para o seu evento no Vale do Paraíba e em São Paulo",
    template: "%s · EventeIA",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [...SEO_KEYWORDS],
  // Favicons: app/icon.png (64px) e app/apple-icon.png (180px) — antes era o logo de 325 KB.
  alternates: { canonical: "/" },
  openGraph: {
    title: "EventeIA — Fornecedores encontrados, preços comparados, orçamento pronto",
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "pt_BR",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "EventeIA — Fornecedores encontrados, preços comparados, orçamento pronto",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  other: { "llms-txt": "/llms.txt" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${displayItalic.variable} ${body.variable}`}>
      <body>
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
