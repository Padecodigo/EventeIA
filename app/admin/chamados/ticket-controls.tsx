"use client";

import { useActionState } from "react";

import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  canTransition,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/pure";

import { adminUpdateTicketAction } from "./actions";

export function TicketControls({
  ticketId,
  status,
  priority,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
}) {
  const [state, action, pending] = useActionState(adminUpdateTicketAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Status</span>
        <span className="text-caption text-vinho/60">Em que pé está o atendimento (só mostra as mudanças permitidas).</span>
        <select name="status" defaultValue={status} className="rounded-xl border border-vinho/15 bg-white px-3 py-2">
          {TICKET_STATUSES.filter((s) => canTransition(status, s)).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Prioridade</span>
        <span className="text-caption text-vinho/60">Urgência para a equipe; não aparece para o usuário.</span>
        <select name="priority" defaultValue={priority} className="rounded-xl border border-vinho/15 bg-white px-3 py-2">
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded-full border border-vinho/20 px-5 py-2 font-semibold disabled:opacity-60">
        Salvar
      </button>
      {state?.ok === false && <p role="alert" className="text-semantic-error">{state.error}</p>}
      {state?.ok === true && <p role="status" className="text-vinho/70">Atualizado.</p>}
    </form>
  );
}
