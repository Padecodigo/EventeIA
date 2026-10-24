import Link from "next/link";

import { StatusBadge, formatTicketDate } from "@/components/support/ticket-thread";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TYPE_LABELS, shortId } from "@/lib/support/pure";

export const metadata = { title: "Meus chamados" };

export default async function MyTicketsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // RLS: só os tickets do próprio usuário.
  const { data } = await supabase
    .from("support_tickets")
    .select("id,type,subject,status,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Ajuda e feedback</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Meus chamados.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vinho/75">
          Sugestões, reclamações, elogios e problemas que você enviou. Use o botão “Ajuda e feedback” para abrir um novo.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-vinho/70">Você ainda não enviou nenhuma mensagem.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/chamados/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-white p-4 transition hover:border-primaria/40">
                <span>
                  <span className="block text-caption text-vinho/60">
                    #{shortId(t.id)} · {TYPE_LABELS[t.type]} · {formatTicketDate(t.created_at)}
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
