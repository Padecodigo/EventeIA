import Link from "next/link";
import { notFound } from "next/navigation";

import { isUuid } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_USER_DELETED_LABEL, isUserDeleted } from "@/lib/events/history-deletion";
import { formatBRL } from "@/lib/money";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, EVENT_STATUS_LABELS, READ_ONLY_NOTE, fmtDate } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = getSupabaseAdmin();
  const { data: p } = await admin.from("profiles").select("id,display_name,email,phone_e164,contact_whatsapp_e164,instagram_handle,role,document_type,created_at").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [events, pays, tickets] = await Promise.all([
    admin.from("events").select("id,title,event_date,status,city,user_deleted_at").eq("owner_profile_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("payments").select("id,event_id,amount_cents,billing_type,status,created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("support_tickets").select("id,subject,status,created_at").eq("user_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
  ]);
  const paidTotal = (pays.data ?? []).filter((x) => x.status === "paid" || x.status === "confirmed").reduce((s, x) => s + x.amount_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-caption"><Link className="underline" href="/admin/clientes">← Clientes</Link></p>
        <h2 className="font-serif text-title-2">{p.display_name || "(sem nome)"}</h2>
        <p className="text-caption text-vinho/60">{READ_ONLY_NOTE}</p>
      </header>
      <Card testId="client-info">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-caption text-vinho/60">E-mail</dt><dd>{p.email ?? "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Telefone</dt><dd>{p.phone_e164 ?? "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">WhatsApp</dt><dd>{p.contact_whatsapp_e164 ?? "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Instagram</dt><dd>{p.instagram_handle ? `@${p.instagram_handle}` : "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Tipo</dt><dd>{p.role} · {p.document_type.toUpperCase()}</dd></div>
          <div><dt className="text-caption text-vinho/60">Cliente desde</dt><dd>{fmtDate(p.created_at)}</dd></div>
          <div><dt className="text-caption text-vinho/60">Total pago</dt><dd className="tabular-nums">{formatBRL(paidTotal)}</dd></div>
        </dl>
      </Card>
      <Card testId="client-events">
        <h3 className="font-serif text-title-3">Eventos ({(events.data ?? []).length})</h3>
        {(events.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum evento.</p> : (
          <ul className="text-sm">{(events.data ?? []).map((e) => isUserDeleted(e) ? <li key={e.id} className="border-t border-line-subtle py-1 text-vinho/60">{ADMIN_USER_DELETED_LABEL}</li> : <li key={e.id} className="border-t border-line-subtle py-1"><Link className="underline" href={`/admin/eventos/${e.id}`}>{e.title}</Link> · {fmtDate(e.event_date)} · {e.city ?? "sem cidade"} · {EVENT_STATUS_LABELS[e.status] ?? e.status}</li>)}</ul>
        )}
      </Card>
      <Card testId="client-payments">
        <h3 className="font-serif text-title-3">Pagamentos</h3>
        {(pays.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum pagamento.</p> : (
          <ul className="text-sm">{(pays.data ?? []).map((x) => <li key={x.id} className="border-t border-line-subtle py-1">{fmtDate(x.created_at)} · {formatBRL(x.amount_cents)} · {x.billing_type === "COURTESY" ? "Cortesia" : x.billing_type} · {x.status}{x.event_id ? <> · <Link className="underline" href={`/admin/eventos/${x.event_id}`}>evento</Link></> : null}</li>)}</ul>
        )}
      </Card>
      <Card testId="client-tickets">
        <h3 className="font-serif text-title-3">Chamados</h3>
        {(tickets.data ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum chamado.</p> : (
          <ul className="text-sm">{(tickets.data ?? []).map((t) => <li key={t.id} className="border-t border-line-subtle py-1"><Link className="underline" href={`/admin/chamados/${t.id}`}>{t.subject}</Link> · {t.status} · {fmtDate(t.created_at)}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
