import Link from "next/link";

import { NewEventForm } from "@/components/domain/new-event-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Eventos" };

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  canceled: "Cancelado",
};

export default async function EventsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase
    .from("events")
    .select("id,title,event_type,event_date,guest_count,status,created_at")
    .order("created_at", { ascending: false });

  const list = events ?? [];

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">Eventos</p>
        <h1 className="mt-2 font-serif text-display-2 font-display">O que você imagina?</h1>
        <p className="mt-3 max-w-prose text-vinho/75">
          Descreva o evento. O orçamento é calculado de forma determinística — os mesmos dados sempre
          produzem o mesmo resultado, e cada número é explicado.
        </p>
      </section>

      <NewEventForm />

      <section>
        <h2 className="font-serif text-title-1">Seus eventos</h2>

        {list.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-line-strong bg-off-white p-8 text-sm text-vinho/75">
            Nenhum evento ainda. Use o formulário acima para criar o primeiro.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line-subtle rounded-card border border-line-subtle bg-off-white">
            {list.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/eventos/${event.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:bg-areia-quente/60"
                >
                  <div>
                    <p className="font-medium text-vinho">{event.title}</p>
                    <p className="text-caption text-vinho/75">
                      {event.event_type} · {event.guest_count} convidados ·{" "}
                      {new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
                    {statusLabels[event.status] ?? event.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
