import { Inter, Nunito } from "next/font/google";

import type { Metadata } from "next";

import "./globals.css";

/** Display: Nunito (arredondada, acolhedora). Corpo/UI: Inter (limpa, confiável). */
const display = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
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
  icons: { icon: "/logo-e.png" },
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
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
