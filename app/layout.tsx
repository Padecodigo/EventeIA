import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Eventeia — Inteligência para eventos extraordinários",
  description: "Clareza financeira e inteligência para criar eventos extraordinários.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
