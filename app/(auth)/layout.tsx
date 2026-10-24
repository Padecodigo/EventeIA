import Image from "next/image";
import Link from "next/link";

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-areia-quente text-vinho">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo-e.png" alt="EventeIA" width={36} height={36} priority />
          <span className="font-serif text-xl font-semibold tracking-editorial">EventeIA</span>
        </Link>
        <Link href="/" className="text-sm text-vinho/70 transition hover:text-vinho">
          Voltar ao site
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-card border border-line-subtle bg-off-white p-8 shadow-soft">
          {children}
        </div>
      </main>
    </div>
  );
}
