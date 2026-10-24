"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-areia-quente px-6 py-24 text-center text-vinho">
      <p className="eyebrow">Algo deu errado</p>
      <h1 className="mt-5 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-tight">
        Um imprevisto <span className="text-primaria">no meio do caminho.</span>
      </h1>
      <p className="mt-4 max-w-md text-vinho/75">Não foi você. Tente de novo em instantes — seus dados estão seguros.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Tentar de novo
        </button>
        <Link href="/" className="btn-secondary">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
