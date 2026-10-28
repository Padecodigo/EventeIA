"use client";

import { useActionState } from "react";

import type { OpResult } from "@/lib/admin/suppliers";

import { publishPostAction } from "./actions";

/** Botão de publicação do post planejado (o clique é a aprovação humana). */
export function PublishPostButton({
  dayIndex,
  category,
  handles,
  imagePrompt,
  caption,
  eventId,
}: {
  dayIndex: number;
  category: string;
  handles: string[];
  imagePrompt: string;
  caption: string;
  eventId?: string;
}) {
  const [state, action, pending] = useActionState<OpResult | null, FormData>(publishPostAction, null);

  if (state?.ok) {
    return <p role="status" className="text-sm text-vinho/70">Post publicado.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="dayIndex" value={dayIndex} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="handles" value={JSON.stringify(handles)} />
      <input type="hidden" name="imagePrompt" value={imagePrompt} />
      <input type="hidden" name="caption" value={caption} />
      {eventId !== undefined ? <input type="hidden" name="eventId" value={eventId} /> : null}
      {state && !state.ok ? <p role="alert" className="text-semantic-error">{state.error}</p> : null}
      <button
        disabled={pending}
        className="self-start rounded-full bg-vinho px-4 py-2 font-semibold text-off-white disabled:opacity-50"
      >
        {pending ? "Publicando…" : "Aprovar e publicar"}
      </button>
    </form>
  );
}
