import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteOwnTicketAction, editOwnTicketAction, replySupportTicketAction } from "@/app/actions/support";
import { OwnerTicketControls } from "@/components/support/owner-ticket-controls";
import { ReplyForm } from "@/components/support/reply-form";
import { StatusBadge, TicketThread } from "@/components/support/ticket-thread";
import { isAdminUser, requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ownerCanEdit } from "@/lib/support/owner-ops";
import { TYPE_LABELS, shortId, userCanReply } from "@/lib/support/pure";

export const metadata = { title: "Chamado" };

export default async function MyTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id,user_id,type,subject,message,status,created_at,edited_at,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (ticket === null) notFound();
  const isOwner = ticket.user_id === user.id;
  // Chamado excluído pelo dono some para ele (admin vê pela Lixeira).
  if (isOwner && ticket.deleted_at) notFound();
  // Admin (superusuário) visualiza qualquer chamado; responde pela tela /admin/chamados.
  if (!isOwner && !(await isAdminUser(user.id))) notFound();
  const { data: messages } = await supabase
    .from("support_ticket_messages")
    .select("id,author_role,body,created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/chamados" className="text-sm text-vinho/70 hover:text-vinho">
        ← Meus chamados
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            #{shortId(ticket.id)} · {TYPE_LABELS[ticket.type]}
          </p>
          <h1 className="mt-2 font-serif text-2xl text-vinho">{ticket.subject}</h1>
        </div>
        <StatusBadge status={ticket.status} />
      </header>
      {ticket.edited_at ? <p className="-mt-4 text-caption text-vinho/60">Editado pelo autor.</p> : null}
      {isOwner ? (
        <OwnerTicketControls ticketId={ticket.id} subject={ticket.subject} message={ticket.message}
          canEdit={ownerCanEdit(ticket.status, ticket.deleted_at)} editAction={editOwnTicketAction} deleteAction={deleteOwnTicketAction} />
      ) : null}
      <TicketThread original={ticket} messages={messages ?? []} viewer="user" />
      {isOwner && userCanReply(ticket.status) ? (
        <ReplyForm ticketId={ticket.id} action={replySupportTicketAction} />
      ) : (
        <p className="text-sm text-vinho/70">Este chamado foi fechado. Abra um novo se precisar.</p>
      )}
    </div>
  );
}
