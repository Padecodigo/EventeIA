import Link from "next/link";

import { StatusBadge, formatTicketDate } from "@/components/support/ticket-thread";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  TYPE_LABELS,
  countTickets,
  shortId,
  ticketFiltersSchema,
} from "@/lib/support/pure";

export const metadata = { title: "Chamados", robots: { index: false, follow: false } };

const selectClass = "rounded-xl border border-vinho/15 bg-white px-3 py-2 text-sm";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = ticketFiltersSchema.parse({
    type: sp.type,
    status: sp.status,
    priority: sp.priority,
    from: sp.from,
    to: sp.to,
  });
  const admin = getSupabaseAdmin();

  let query = admin
    .from("support_tickets")
    .select("id,type,subject,status,priority,email,user_id,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00-03:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999-03:00`);

  const [{ data }, { data: all }] = await Promise.all([
    query,
    admin.from("support_tickets").select("type,status").limit(5000),
  ]);
  const items = data ?? [];
  const counts = countTickets(all ?? []);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Central de atendimento.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vinho/75">
          Pedidos de ajuda, erros e sugestões enviados pelos usuários e visitantes pelo botão de suporte do site. Abra um chamado para responder e mudar o status.
        </p>
        <p className="mt-2 text-caption text-vinho/60">Os números abaixo contam todos os chamados (até 5 mil), sem filtro: primeiro por tipo, depois por status.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-caption">
          {TICKET_TYPES.map((t) => (
            <span key={t} className="rounded-full bg-areia-secundaria px-3 py-1 text-vinho/75">
              {TYPE_LABELS[t]}: {counts.byType[t]}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-caption">
          {TICKET_STATUSES.map((s) => (
            <span key={s} className="rounded-full bg-vinho px-3 py-1 text-off-white">
              {STATUS_LABELS[s]}: {counts.byStatus[s]}
            </span>
          ))}
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Tipo<select name="type" defaultValue={filters.type ?? ""} className={selectClass} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Status<select name="status" defaultValue={filters.status ?? ""} className={selectClass} aria-label="Status">
          <option value="">Todos os status</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Prioridade<select name="priority" defaultValue={filters.priority ?? ""} className={selectClass} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">De<input type="date" name="from" defaultValue={filters.from ?? ""} className={selectClass} aria-label="De" /><span className="font-normal text-vinho/60">data de abertura (início)</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Até<input type="date" name="to" defaultValue={filters.to ?? ""} className={selectClass} aria-label="Até" /><span className="font-normal text-vinho/60">data de abertura (fim)</span></label>
        <button type="submit" className="rounded-full bg-vinho px-5 py-2 text-sm font-semibold text-off-white">
          Filtrar
        </button>
      </form>

      <p className="-mt-4 text-caption text-vinho/60">Filtre a lista por tipo, status, prioridade ou data de abertura (horário de Brasília). O selo à direita de cada chamado é o status atual.</p>

      {items.length === 0 ? (
        <p className="text-sm text-vinho/70">Nenhum chamado com esses filtros.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/chamados/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-white p-4 hover:border-primaria/40">
                <span>
                  <span className="block text-caption text-vinho/60">
                    #{shortId(t.id)} · {TYPE_LABELS[t.type]} · {PRIORITY_LABELS[t.priority]} · {formatTicketDate(t.created_at)}
                    {t.user_id === null ? " · visitante" : ""}
                  </span>
                  <span className="font-semibold text-vinho">{t.subject}</span>
                </span>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
