import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-areia-quente text-vinho">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="eyebrow">Erro 404</p>
        <h1 className="mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-tight">
          Essa página <span className="text-primaria">saiu da festa.</span>
        </h1>
        <p className="mt-4 max-w-md text-vinho/75">O endereço pode ter mudado ou não existe mais. Vamos voltar ao começo?</p>
        <Link href="/" className="btn-primary mt-8">
          Voltar ao início
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
