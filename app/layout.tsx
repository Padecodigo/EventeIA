import { Bodoni_Moda, DM_Sans, Fraunces } from "next/font/google";

import type { Metadata } from "next";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
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
    "Você imagina a festa. A EventeIA faz acontecer. Inteligência de custos e cotações para festas infantis e todos os eventos — com clareza financeira.",
  icons: { icon: "/logo-e.png" },
  openGraph: {
    title: "EventeIA",
    description: "A clareza financeira e a inteligência que o seu evento merece.",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/EventeIA-celebration.png", width: 1376, height: 768 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EventeIA",
    description: "A clareza financeira e a inteligência que o seu evento merece.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${dmSans.variable} ${bodoni.variable}`}>
      <body>{children}</body>
    </html>
  );
}
