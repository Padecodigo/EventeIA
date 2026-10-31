import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-areia-quente text-vinho">
      <SiteHeader />

      <main className="relative isolate flex flex-1 items-center justify-center px-5 py-14 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_85%_0%,var(--color-areia-secundaria),transparent),radial-gradient(40%_50%_at_0%_100%,var(--color-champagne-claro),transparent)]"
        />
        <div className="card w-full max-w-md p-8 sm:p-10">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
