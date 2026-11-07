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
          <p className="mt-3 max-w-prose text-sm text-vinho/75">
            O ticket é comprado na página do evento, no momento de ativar o orçamento. Crie o evento
            primeiro — depois você compra o ticket dele.
          </p>
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
