import Link from "next/link";

import { WelcomeTicketNote } from "@/components/marketing/welcome-offer";
import { formatBRL } from "@/lib/money";
import { pageMetadata } from "@/lib/seo/site";

const ticketPriceCents = Number(process.env.B2C_TICKET_PRICE_CENTS ?? "9700");

export const metadata = pageMetadata({
  title: "Comprar ticket — R$ 97 por evento",
  description: `Um ticket de ${formatBRL(ticketPriceCents)} por evento, sem mensalidade. Pix ou cartão, com o orçamento completo da sua festa.`,
  path: "/comprar",
  keywords: ["preço orçamento de festa", "quanto custa orçamento de evento"],
});

export default function PricesPage() {
  return (
    <div className="bg-areia-quente text-vinho">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-coral-escuro">Preço</p>
        <h1 className="mt-3 max-w-prose font-serif text-display-2 font-display text-vinho">
          Um ticket por evento. Sem mensalidade.
        </h1>
        <p className="mt-4 max-w-prose text-vinho/85">
          Você paga uma vez, quando decide ativar o evento. O orçamento completo, as cotações e o
          contato com os fornecedores vêm juntos — e você só fecha com quem quiser.
        </p>

        <article className="mt-10 rounded-card border border-line-subtle bg-off-white p-8 shadow-soft sm:p-10">
          <p className="eyebrow">Anfitriões</p>
          <h2 className="mt-3 font-serif text-title-1">Tíquete por evento</h2>
          <p className="mt-6 font-serif text-display-2">{formatBRL(ticketPriceCents)}</p>
          <p className="text-caption text-vinho/75">pagamento único, por evento</p>
          <WelcomeTicketNote />
          <ul className="mt-6 space-y-2 text-sm text-vinho/75">
            <li>Sem mensalidade e sem renovação automática</li>
            <li>Orçamento único no menor preço válido, com taxas incluídas</li>
            <li>Cotações ilimitadas do evento</li>
            <li>Acesso permanente ao evento</li>
          </ul>
          <Link
            prefetch={false}
            href="/registrar"
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura"
          >
            Começar agora
          </Link>
        </article>

        <p className="mt-8 text-sm text-vinho/70">
          Dúvidas sobre o que está incluído?{" "}
          <Link prefetch={false} href="/como-funciona" className="font-medium text-coral-escuro underline decoration-coral-escuro/50 underline-offset-4">
            Veja o passo a passo
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
