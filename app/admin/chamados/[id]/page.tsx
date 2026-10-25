import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplyForm } from "@/components/support/reply-form";
import { StatusBadge, TicketThread, formatTicketDate } from "@/components/support/ticket-thread";
import { EmailText } from "@/components/ui/email-text";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRIORITY_LABELS, TYPE_LABELS, shortId } from "@/lib/support/pure";
import { signedAttachmentUrl } from "@/lib/support/runtime";

import { adminReplyTicketAction } from "../actions";
import { CloseControls } from "../close-controls";
import { TicketControls } from "../ticket-controls";

export const metadata = { title: "Chamado", robots: { index: false, follow: false } };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin.from("support_tickets").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (ticket === null) notFound();
  const [{ data: messages }, profileRes, attachmentUrl] = await Promise.all([
    admin.from("support_ticket_messages").select("id,author_role,body,created_at").eq("ticket_id", id).order("created_at"),
    ticket.user_id === null
      ? Promise.resolve({ data: null })
      : admin.from("profiles").select("display_name,email").eq("id", ticket.user_id).maybeSingle(),
    signedAttachmentUrl(ticket.attachment_path),
  ]);
  const contact = profileRes.data?.email ?? ticket.email ?? "—";
  const closer = ticket.closed_by
    ? (await admin.from("profiles").select("display_name,email").eq("id", ticket.closed_by).maybeSingle()).data
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/chamados" className="text-sm text-vinho/70 hover:text-vinho">← Chamados</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">#{shortId(ticket.id)} · {TYPE_LABELS[ticket.type]} · {PRIORITY_LABELS[ticket.priority]}</p>
          <h1 className="mt-2 font-serif text-2xl text-vinho">{ticket.subject}</h1>
          <p className="mt-2 text-caption text-vinho/70">
            {profileRes.data?.display_name ?? (ticket.user_id === null ? "Visitante" : "Usuário")} · <EmailText email={contact} /> · {formatTicketDate(ticket.created_at)}
          </p>
          <p className="text-caption text-vinho/60">
            Página: {ticket.page_url ?? "—"}
            {ticket.event_id !== null ? ` · Evento ${ticket.event_id}` : ""}
          </p>
          {ticket.user_agent !== null && <p className="text-caption text-vinho/50">{ticket.user_agent}</p>}
        </div>
        <StatusBadge status={ticket.status} />
      </header>
      <p className="text-caption text-vinho/60">Detalhe do chamado: quem abriu, de qual página e a conversa. Mude o status/prioridade abaixo e responda no fim da página; a resposta é enviada ao usuário.</p>
      {ticket.status === "fechado" ? (
        <p data-testid="ticket-closed-info" className="text-caption text-vinho/70">
          Encerrado{ticket.closed_at ? ` em ${formatTicketDate(ticket.closed_at)}` : ""}{closer ? ` por ${closer.display_name ?? closer.email ?? "admin"}` : ticket.closed_at ? "" : " (antes deste registro existir)"}.
        </p>
      ) : null}
      <CloseControls ticketId={ticket.id} closed={ticket.status === "fechado"} subject={ticket.subject} />
      <TicketControls ticketId={ticket.id} status={ticket.status} priority={ticket.priority} />
      {attachmentUrl !== null && (
        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primaria-escura underline">
          Ver captura de tela (link temporário)
        </a>
      )}
      <TicketThread original={ticket} messages={messages ?? []} viewer="admin" />
      <ReplyForm ticketId={ticket.id} action={adminReplyTicketAction} />
    </div>
  );
}
