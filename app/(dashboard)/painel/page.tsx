import Link from "next/link";

import { getUserActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { categoryLabel } from "@/lib/quotes/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  canceled: "Cancelado",
};

export const metadata = { title: "Painel" };

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [eventsResult, activeTicketsResult, countResult] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,status,event_date,created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("event_tickets").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("events").select("id", { count: "exact", head: true }),
  ]);

  const events = eventsResult.data ?? [];
  const activeTickets = activeTicketsResult.count ?? 0;
  const totalEvents = countResult.count ?? 0;
  const { data: instances } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("instance_name,status")
    .eq("profile_id", user.id)
    .limit(1);
  const disconnectedInstance = instances?.find((item) => item.status === "disconnected") ?? null;
  const [activity, quotesResult] = await Promise.all([
    getUserActivity(user.id, 10),
    supabase
      .from("quotations")
      .select("id,event_id,vendor_name,category,amount_cents,needs_followup,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const quotes = quotesResult.data ?? [];

  return (
    <div className="flex flex-col gap-10">
      {disconnectedInstance !== null ? (
        <p role="alert" className="rounded-card border border-semantic-error/30 bg-semantic-error/10 px-5 py-4 text-sm text-semantic-error">
          Seu WhatsApp desconectou (sessão expirada ou sem internet). A prospecção de fornecedores
          está pausada — reconecte a instância para retomar automaticamente.
        </p>
      ) : null}

      <section>
        <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">O seu ateliê</p>
        <h1 className="mt-2 font-serif text-display-2 font-display">A clareza começa aqui.</h1>
        <p className="mt-3 max-w-prose text-vinho/75">
          Acompanhe os seus eventos, orçamentos e disparos. Tudo no mesmo lugar, sem planilhas soltas.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <article className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
          <p className="text-caption text-vinho/75">Eventos criados</p>
          <p className="mt-2 font-serif text-display-2">{totalEvents}</p>
        </article>
        <article className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
          <p className="text-caption text-vinho/75">Tíquetes ativos</p>
          <p className="mt-2 font-serif text-display-2">{activeTickets}</p>
        </article>
        <article className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
          <p className="text-caption text-vinho/75">Próximo passo</p>
          <p className="mt-2 font-serif text-title-2">Criar um evento</p>
          <Link
            href="/eventos"
            className="mt-4 inline-flex text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
          >
            Ir para eventos
          </Link>
        </article>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-title-1">Últimos eventos</h2>
          <Link
            href="/eventos"
            className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
          >
            Ver todos
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-line-strong bg-off-white p-10 text-center">
            <p className="font-serif text-title-2">Nenhum evento por aqui ainda.</p>
            <p className="mt-2 text-sm text-vinho/75">
              Comece descrevendo o que você imagina — o orçamento ganha forma em minutos.
            </p>
            <Link
              href="/eventos"
              className="mt-6 inline-flex rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-white transition hover:bg-primaria-escura"
            >
              Criar primeiro evento
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line-subtle rounded-card border border-line-subtle bg-off-white">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/eventos/${event.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:bg-areia-quente/60"
                >
                  <div>
                    <p className="font-medium text-vinho">{event.title}</p>
                    <p className="text-caption text-vinho/75">
                      {new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString("pt-BR")} ·{" "}
                      {statusLabels[event.status] ?? event.status}
                    </p>
                  </div>
                  <span className="text-sm text-vinho/70">ver evento →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-title-1">Cotações recebidas</h2>
        {quotes.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-line-strong bg-off-white p-8 text-sm text-vinho/75">
            As cotações dos fornecedores aparecem aqui assim que chegarem pelo WhatsApp.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-line-subtle rounded-card border border-line-subtle bg-off-white">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/eventos/${q.event_id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition hover:bg-areia-quente/60">
                  <span className="text-sm">
                    <span className="font-medium">{q.vendor_name}</span>{" "}
                    <span className="text-vinho/70">· {categoryLabel(q.category)}</span>
                    {q.needs_followup ? <span className="ml-2 text-caption text-vinho/60">(aguardando detalhes)</span> : null}
                  </span>
                  <span className="flex items-center gap-4 text-sm tabular-nums">
                    {formatBRL(q.amount_cents)}
                    <time dateTime={q.created_at} className="text-caption text-vinho/60">
                      {new Date(q.created_at).toLocaleDateString("pt-BR")}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-title-1">Histórico</h2>
          <p className="text-caption text-vinho/70">Últimas atividades da sua conta.</p>
        </div>

        {activity.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-line-strong bg-off-white p-8 text-sm text-vinho/75">
            Ainda não há atividades. Crie um evento para começar o histórico.
          </p>
        ) : (
          <ol className="mt-5 space-y-3">
            {activity.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-4 rounded-card border border-line-subtle bg-off-white px-5 py-4"
              >
                <span
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-champagne"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-vinho">{item.label}</p>
                  {item.detail !== undefined ? (
                    <p className="text-caption text-vinho/70">{item.detail}</p>
                  ) : null}
                </div>
                <time
                  dateTime={item.occurredAt}
                  className="shrink-0 text-caption text-vinho/70"
                >
                  {new Date(item.occurredAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-caption text-vinho/70">
        Valores exibidos em reais, calculados no servidor e sempre explicados — {formatBRL(0)} de
        surpresa.
      </p>
    </div>
  );
}
