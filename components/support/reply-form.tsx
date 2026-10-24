"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/lib/support/service";

type State = ActionResult | null;

/** Formulário de resposta na thread (usuário ou admin). */
export function ReplyForm({
  ticketId,
  action,
}: {
  ticketId: string;
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea
        name="body"
        required
        maxLength={5000}
        rows={4}
        placeholder="Escreva sua resposta…"
        className="w-full rounded-xl border border-vinho/15 bg-white px-3 py-2 text-vinho"
        key={state?.ok === true ? "sent" : "draft"}
      />
      {state?.ok === false && (
        <p role="alert" className="text-semantic-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-full bg-vinho px-5 py-2 font-semibold text-off-white disabled:opacity-60">
        {pending ? "Enviando…" : "Responder"}
      </button>
    </form>
  );
}
