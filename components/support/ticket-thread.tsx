import { STATUS_LABELS, type TicketStatus } from "@/lib/support/pure";

export interface ThreadMessage {
  id: string;
  author_role: "user" | "admin";
  body: string;
  created_at: string;
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function formatTicketDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const tone =
    status === "aberto"
      ? "bg-champagne-claro text-vinho"
      : status === "em_andamento"
        ? "bg-verde-claro text-vinho"
        : "bg-areia-secundaria text-vinho/70";
  return <span className={`rounded-full px-3 py-1 text-caption font-semibold ${tone}`}>{STATUS_LABELS[status]}</span>;
}

/** Mensagem original + respostas, em ordem cronológica. Texto puro (sem HTML). */
export function TicketThread({
  original,
  messages,
  viewer,
}: {
  original: { message: string; created_at: string };
  messages: ThreadMessage[];
  viewer: "user" | "admin";
}) {
  const label = (role: "user" | "admin") =>
    role === "admin" ? "Equipe EventeIA" : viewer === "user" ? "Você" : "Usuário";
  return (
    <ol className="flex flex-col gap-3">
      <li className="rounded-2xl border border-line-subtle bg-white p-4">
        <p className="text-caption text-vinho/60">
          {label("user")} · {formatTicketDate(original.created_at)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-vinho">{original.message}</p>
      </li>
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-2xl border p-4 ${m.author_role === "admin" ? "border-primaria/30 bg-verde-claro/40" : "border-line-subtle bg-white"}`}
        >
          <p className="text-caption text-vinho/60">
            {label(m.author_role)} · {formatTicketDate(m.created_at)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-vinho">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
