"use client";

import { useActionState } from "react";

import {
  dismissProspectReplyAction,
  sendProspectReplyAction,
  type ProspectReplyState,
} from "@/app/(dashboard)/eventos/[id]/prospect-reply-actions";
import { Button } from "@/components/ui/button";

export interface ProspectReplyView {
  prospectId: string;
  vendorName: string;
  categoryLabel: string;
  kind: "question" | "values" | "unavailable" | "other";
  reply: string;
}

const KIND_LABELS: Record<ProspectReplyView["kind"], string> = {
  question: "fez uma pergunta",
  values: "mandou valores",
  unavailable: "sem disponibilidade na data",
  other: "outro assunto",
};

const initialState: ProspectReplyState = {};

function ReplyRow({ eventId, row }: { eventId: string; row: ProspectReplyView }) {
  const [state, action, pending] = useActionState(sendProspectReplyAction, initialState);
  const [dismissState, dismissAction, dismissing] = useActionState(
    dismissProspectReplyAction,
    initialState,
  );

  return (
    <article className="rounded-xl border border-line-subtle p-4">
      <p className="text-sm font-semibold text-vinho">
        {row.vendorName} <span className="font-normal text-vinho/60">· {row.categoryLabel}</span>
      </p>
      <p className="mt-1 text-caption text-vinho/60">Fornecedor {KIND_LABELS[row.kind]}.</p>

      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="prospectId" value={row.prospectId} />
        <label htmlFor={`reply-${row.prospectId}`} className="text-caption text-vinho/70">
          Resposta sugerida (revise antes de enviar)
        </label>
        <textarea
          id={`reply-${row.prospectId}`}
          name="reply"
          rows={3}
          maxLength={600}
          defaultValue={row.reply}
          className="w-full rounded-xl border border-line-subtle bg-off-white px-4 py-3 text-sm text-vinho"
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="submit" variant="secondary" disabled={pending || dismissing}>
            {pending ? "Enviando…" : "Aprovar e enviar"}
          </Button>
        </div>
      </form>

      <form action={dismissAction} className="mt-2 flex justify-end">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="prospectId" value={row.prospectId} />
        <Button type="submit" variant="ghost" disabled={pending || dismissing}>
          {dismissing ? "Descartando…" : "Ignorar"}
        </Button>
      </form>

      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.sent === true ? (
        <p className="mt-2 text-caption text-vinho/70">Resposta enviada ao fornecedor.</p>
      ) : null}
      {dismissState.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-semantic-error">
          {dismissState.error}
        </p>
      ) : null}
    </article>
  );
}

/** Perguntas/dúvidas dos fornecedores com resposta redigida pela IA para aprovação. */
export function ProspectRepliesPanel({
  eventId,
  rows,
}: {
  eventId: string;
  rows: ProspectReplyView[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-card border border-champagne/40 bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Respostas para aprovar</h2>
      <p className="mt-2 max-w-prose text-sm text-vinho/70">
        O fornecedor perguntou algo. A EventeIA preparou uma resposta — revise, ajuste se quiser e
        aprove o envio.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((row) => (
          <ReplyRow key={row.prospectId} eventId={eventId} row={row} />
        ))}
      </div>
    </section>
  );
}
