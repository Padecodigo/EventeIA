import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-areia-quente text-vinho">
      <div className="bg-lilas-claro px-4 py-2 text-center text-[13px] text-ameixa">
        Primeiras 48h: 20% de desconto no ticket, automático no checkout.{" "}
        <Link prefetch={false} href="/comprar" className="font-semibold underline underline-offset-4">
          Ver o ticket
        </Link>
      </div>
      <SiteHeader />

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
