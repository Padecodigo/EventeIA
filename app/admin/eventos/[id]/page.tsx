import Link from "next/link";
import { notFound } from "next/navigation";

import { EventChat } from "@/components/domain/event-chat";
import { loadEventCost } from "@/lib/admin/event-finance";
import { isUuid } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_USER_DELETED_LABEL, isUserDeleted } from "@/lib/events/history-deletion";
import { PROVIDER_LABELS } from "@/lib/finance/load";
import { formatBRL } from "@/lib/money";
import { listEventChatConversations } from "@/lib/outreach/chat-read";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, EVENT_STATUS_LABELS, READ_ONLY_NOTE, fmtDate } from "../../ui";

export const dynamic = "force-dynamic";

const PAY_STATUS: Record<string, string> = { pending: "Pendente", paid: "Pago", confirmed: "Confirmado", overdue: "Vencido", refunded: "Estornado", risk_review: "Em análise", chargeback: "Contestado" };
const PROSPECT_STATUS: Record<string, string> = { pending: "Na fila", sent: "Contatado", replied: "Respondeu", opt_out: "Pediu para sair", failed: "Falhou" };

export default async function AdminEventoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = getSupabaseAdmin();
  const { data: ev } = await admin.from("events").select("*").eq("id", id).maybeSingle();
  if (!ev) notFound();
  // 0074: evento apagado pelo usuário — admin vê só o rótulo, sem conteúdo.
  if (isUserDeleted(ev)) {
    return (
      <div className="flex flex-col gap-3" data-testid="admin-event-user-deleted">
        <p className="text-caption"><Link className="underline" href="/admin/eventos">← Eventos</Link></p>
        <h2 className="font-serif text-title-2">{ADMIN_USER_DELETED_LABEL}</h2>
      </div>
    );
  }
  const [owner, prospects, pays, tickets, cost, conversations] = await Promise.all([
    admin.from("profiles").select("id,display_name,email").eq("id", ev.owner_profile_id).maybeSingle(),
    admin.from("vendor_prospects").select("id,vendor_name,vendor_category,status,supplier_id,last_message_at").eq("event_id", id).order("created_at", { ascending: false }).limit(300),
    admin.from("payments").select("id,purpose,billing_type,amount_cents,status,created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("support_tickets").select("id,subject,status,created_at").eq("event_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    loadEventCost(id, ev.title),
    listEventChatConversations(id),
  ]);
  const o = owner.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption"><Link className="underline" href="/admin/eventos">← Eventos</Link></p>
          <h2 className="font-serif text-title-2">{ev.title}</h2>
          <p className="text-caption text-vinho/60">{READ_ONLY_NOTE}</p>
        </div>
        <a href={`/admin/eventos/${id}/csv`} className="rounded-full border border-primaria px-4 py-2 text-sm font-semibold text-primaria" data-testid="event-csv">Exportar CSV (custos, receita e margem)</a>
      </header>

      <Card testId="event-info">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-caption text-vinho/60">Tipo</dt><dd>{ev.event_type}</dd></div>
          <div><dt className="text-caption text-vinho/60">Data</dt><dd>{fmtDate(ev.event_date)}</dd></div>
          <div><dt className="text-caption text-vinho/60">Cidade</dt><dd>{ev.city ? `${ev.city}${ev.city_uf ? `/${ev.city_uf}` : ""}` : "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Convidados</dt><dd>{ev.guest_count}</dd></div>
          <div><dt className="text-caption text-vinho/60">Situação</dt><dd>{EVENT_STATUS_LABELS[ev.status] ?? ev.status}</dd></div>
          <div><dt className="text-caption text-vinho/60">Criado em</dt><dd>{fmtDate(ev.created_at)}</dd></div>
          <div><dt className="text-caption text-vinho/60">Cliente</dt><dd>{o ? <Link className="underline" href={`/admin/clientes/${o.id}`}>{o.display_name}</Link> : "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Código</dt><dd className="font-mono text-caption">{ev.id}</dd></div>
        </dl>
      </Card>

      <Card testId="event-cost">
        <h3 className="font-serif text-title-3">Custo, receita e margem</h3>
        <p className="text-sm tabular-nums">Custo {formatBRL(cost.costCents)} · Receita {formatBRL(cost.revenueCents)} · <span className={cost.marginCents < 0 ? "text-semantic-error" : ""}>Margem {formatBRL(cost.marginCents)}</span></p>
        {cost.tools.length > 0 ? (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm tabular-nums">
            <thead className="text-left text-caption text-vinho/60"><tr><th>Ferramenta</th><th>Chamadas</th><th>Valor</th></tr></thead>
            <tbody>{cost.tools.map((t) => <tr key={t.provider} className="border-t border-line-subtle"><td>{PROVIDER_LABELS[t.provider] ?? t.provider}</td><td>{t.calls}</td><td>{formatBRL(t.cents)}{t.estimatedCents > 0 ? " (estimado)" : ""}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="text-caption text-vinho/70">Nenhum custo registrado para este evento.</p>}
        <p className="mt-2 text-caption"><Link className="underline" href={`/admin/custos?ordem=recente#custo-por-evento`}>Ver na tela de custos por evento</Link></p>
      </Card>

      <Card testId="event-payments">
        <h3 className="font-serif text-title-3">Pagamentos</h3>
        {(pays.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum pagamento.</p> : (
          <ul className="text-sm">{(pays.data ?? []).map((p) => <li key={p.id} className="border-t border-line-subtle py-1">{fmtDate(p.created_at)} · {formatBRL(p.amount_cents)} · {p.billing_type === "COURTESY" ? "Cortesia" : p.billing_type} · {PAY_STATUS[p.status] ?? p.status}</li>)}</ul>
        )}
      </Card>

      <Card testId="event-suppliers">
        <h3 className="font-serif text-title-3">Fornecedores contatados ({(prospects.data ?? []).length})</h3>
        {(prospects.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum fornecedor ainda.</p> : (
          <ul className="text-sm">{(prospects.data ?? []).map((p) => (
            <li key={p.id} className="border-t border-line-subtle py-1">
              {p.supplier_id ? <Link className="underline" href={`/admin/fornecedores/${p.supplier_id}`}>{p.vendor_name}</Link> : p.vendor_name} · {p.vendor_category} · {PROSPECT_STATUS[p.status] ?? p.status}
            </li>))}</ul>
        )}
      </Card>

      <Card testId="event-tickets">
        <h3 className="font-serif text-title-3">Chamados deste evento</h3>
        {(tickets.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum chamado.</p> : (
          <ul className="text-sm">{(tickets.data ?? []).map((t) => <li key={t.id} className="border-t border-line-subtle py-1"><Link className="underline" href={`/admin/chamados/${t.id}`}>{t.subject}</Link> · {t.status} · {fmtDate(t.created_at)}</li>)}</ul>
        )}
      </Card>

      <Card testId="event-chat">
        <h3 className="font-serif text-title-3">Conversas mediadas (fornecedores)</h3>
        <p className="mb-3 text-caption text-vinho/70">
          Visão do agente: acompanhe a conversa e intervenha quando necessário. O relay segue a janela
          da Meta e a moderação de contatos.
        </p>
        {conversations.length === 0 ? (
          <p className="text-caption text-vinho/70">Nenhuma conversa de fornecedor neste evento.</p>
        ) : (
          <EventChat eventId={id} conversations={conversations} mode="admin" />
        )}
      </Card>
    </div>
  );
}
