import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { personalEventsFilter } from "@/lib/auth/personal-scope-server";
import { BuyTicketForm } from "@/components/domain/buy-ticket-form";
import { formatBRL } from "@/lib/money";
import { ticketPriceCents } from "@/lib/seo/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Comprar ticket" };

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
};

function dateLabel(iso: string | null): string {
  if (iso === null) return "data a definir";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

/**
 * Pagamento do painel: o ticket é sempre de um evento (R$ 97, pagamento único).
 * Aqui o usuário vê o que está esperando pagamento e compra o ticket daquele evento —
 * não se cria evento nesta tela.
 */
export default async function PaymentPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await personalEventsFilter(supabase, user.id);

  const { data: events } = await supabase
    .from("events")
    .select("id,title,event_date,status")
    .or(scope)
    .neq("status", "canceled")
    .order("created_at", { ascending: false });

  const list = events ?? [];
  const ids = list.map((event) => event.id);

  const { data: tickets } =
    ids.length > 0
      ? await supabase.from("event_tickets").select("event_id,status").in("event_id", ids)
      : { data: [] as { event_id: string; status: string }[] };

  const active = new Set((tickets ?? []).filter((t) => t.status === "active").map((t) => t.event_id));
  const pending = list.filter((event) => !active.has(event.id));
  const price = formatBRL(ticketPriceCents());

  const { data: profile } = await supabase
    .from("profiles")
    .select("document_number")
    .eq("id", user.id)
    .maybeSingle();
  const defaultCpf = profile?.document_number ?? "";

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="eyebrow">Pagamento</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Comprar ticket.</h1>
        <p className="mt-2 max-w-2xl text-sm text-vinho/75">
          Um ticket de <strong className="font-semibold text-vinho">{price}</strong> por evento, pagamento
          único, sem mensalidade. O ticket libera o orçamento completo e as cotações daquele evento.
        </p>
      </section>

      <section aria-labelledby="pendentes-title">
        <h2 id="pendentes-title" className="font-serif text-title-1">
          {pending.length > 0 ? "Esperando pagamento" : "Nenhum evento esperando pagamento"}
        </h2>

        {pending.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {pending.map((event) => (
              <li
                key={event.id}
                className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-serif text-title-2">{event.title}</p>
                  <p className="text-caption text-vinho/70">
                    {dateLabel(event.event_date)} · {statusLabels[event.status] ?? event.status}
                  </p>
                </div>
                <div className="mt-4">
                  <BuyTicketForm
                    eventId={event.id}
                    priceFormatted={price}
                    defaultCpf={defaultCpf}
                    welcome={null}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
            <p className="eyebrow">Ticket por evento</p>
            <p className="mt-2 font-serif text-title-1">{price}</p>
            <p className="mt-1 text-sm text-vinho/75">
              Pagamento único por evento, Pix ou cartão de crédito. Libera o orçamento completo, as
              cotações ilimitadas e o contato com os fornecedores daquele evento.
            </p>
            <ol className="mt-4 space-y-1 text-sm text-vinho/75">
              <li>1. Conte do evento (30 segundos)</li>
              <li>2. Pague o ticket — Pix ou cartão</li>
              <li>3. Receba o orçamento pronto</li>
            </ol>
            <Link
              prefetch={false}
              href="/eventos#novo-evento"
              className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-full bg-primaria px-7 py-3 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura"
            >
              Criar meu evento
            </Link>
            <p className="mt-3 text-caption text-vinho/60">
              O ticket é do evento: você descreve a festa, paga e a entrevista começa com o ticket ativo.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link prefetch={false} href="/eventos" className="font-medium text-coral-escuro underline decoration-coral-escuro/50 underline-offset-4">
            Criar um evento
          </Link>
          <Link prefetch={false} href="/painel" className="font-medium text-vinho/70 underline decoration-vinho/30 underline-offset-4">
            Ver meus eventos
          </Link>
        </div>
      </section>
    </div>
  );
}
