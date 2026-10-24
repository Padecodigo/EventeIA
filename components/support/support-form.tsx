"use client";

import { usePathname } from "next/navigation";

import { useActionState, useEffect, useState } from "react";

import { createSupportTicketAction, type SupportFormState } from "@/app/actions/support";
import { TICKET_TYPES, TYPE_LABELS, eventIdFromPath } from "@/lib/support/pure";

const inputClass =
  "w-full rounded-xl border border-vinho/15 bg-white px-3 py-2 text-sm text-vinho focus:border-primaria focus:outline-none";

/** Formulário de atendimento. `withEmail` = visitante sem login (site público). */
export function SupportForm({ withEmail, onDone }: { withEmail: boolean; onDone?: () => void }) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(createSupportTicketAction, null);
  const pathname = usePathname();
  const [pageUrl, setPageUrl] = useState(pathname);
  useEffect(() => {
    setPageUrl(`${window.location.pathname}${window.location.search}`);
  }, [pathname]);

  if (state?.ok === true) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm text-vinho">
        <p className="font-semibold">Recebemos sua mensagem. Obrigado!</p>
        <p>Enviamos a confirmação por e-mail{withEmail ? "" : " e você acompanha em “Meus chamados”"}.</p>
        {onDone !== undefined && (
          <button type="button" onClick={onDone} className="self-start rounded-full border border-vinho/15 px-4 py-2 font-semibold">
            Fechar
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 text-sm text-vinho">
      <input type="hidden" name="pageUrl" value={pageUrl} />
      <input type="hidden" name="eventId" value={eventIdFromPath(pathname) ?? ""} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Tipo</span>
        <select name="type" required defaultValue="sugestao" className={inputClass}>
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {withEmail && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Seu e-mail</span>
          <input type="email" name="email" required maxLength={254} className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Assunto</span>
        <input name="subject" required minLength={3} maxLength={140} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Mensagem</span>
        <textarea name="message" required minLength={10} maxLength={5000} rows={5} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Captura de tela (opcional, até 5 MB)</span>
        <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" />
      </label>
      {state?.ok === false && (
        <p role="alert" className="text-semantic-error">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-vinho px-5 py-2 font-semibold text-off-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
