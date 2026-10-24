import Link from "next/link";
import { notFound } from "next/navigation";

import { replySupportTicketAction } from "@/app/actions/support";
import { ReplyForm } from "@/components/support/reply-form";
import { StatusBadge, TicketThread } from "@/components/support/ticket-thread";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TYPE_LABELS, shortId, userCanReply } from "@/lib/support/pure";

export const metadata = { title: "Chamado" };

export default async function MyTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id,user_id,type,subject,message,status,created_at")
    .eq("id", id)
    .maybeSingle();
  if (ticket === null || ticket.user_id !== user.id) notFound();
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
      <TicketThread original={ticket} messages={messages ?? []} viewer="user" />
      {userCanReply(ticket.status) ? (
        <ReplyForm ticketId={ticket.id} action={replySupportTicketAction} />
      ) : (
        <p className="text-sm text-vinho/70">Este chamado foi fechado. Abra um novo se precisar.</p>
      )}
    </div>
  );
}
