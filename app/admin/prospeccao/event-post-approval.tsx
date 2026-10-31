"use client";

import { useActionState } from "react";

import type { OpResult } from "@/lib/admin/suppliers";

import { approveEventPostAction } from "./actions";

/** Aprovação humana do post de prospecção do evento (o clique publica). */
export function EventPostApproval({
  eventId,
  caption,
  eventCode,
}: {
  eventId: string;
  caption: string;
  eventCode: string;
}) {
  const [state, action, pending] = useActionState<OpResult | null, FormData>(
    approveEventPostAction,
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">
          Código {eventCode}
        </p>
        <p className="mt-2 whitespace-pre-line text-body text-vinho">{caption}</p>
      </div>
      {state?.ok ? <p role="status" className="text-sm text-vinho/70">Post de prospecção publicado.</p> : null}
      <form action={action} className="flex flex-col gap-2 text-sm">
        <input type="hidden" name="eventId" value={eventId} />
        {state && !state.ok ? <p role="alert" className="text-semantic-error">{state.error}</p> : null}
        <button
          disabled={pending}
          className="self-start rounded-full bg-vinho px-4 py-2 font-semibold text-off-white disabled:opacity-50"
        >
          {pending ? "Publicando…" : "Aprovar e publicar"}
        </button>
      </form>
    </div>
  );
}
