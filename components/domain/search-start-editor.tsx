"use client";

import { useActionState } from "react";

import { updateSearchStartAction } from "@/app/(dashboard)/eventos/actions";
import { SearchStartField } from "@/components/domain/search-start-field";
import { Button } from "@/components/ui/button";

/** Editor da data de início da busca na página do evento (visível só até a busca começar). */
export function SearchStartEditor({
  eventId,
  searchStartDate,
  today,
  eventDate,
}: {
  eventId: string;
  searchStartDate: string | null;
  today: string;
  eventDate: string;
}) {
  const [state, formAction, pending] = useActionState(updateSearchStartAction, {});
  const lastBeforeEvent = new Date(new Date(`${eventDate}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-card border border-line-subtle bg-off-white p-4" data-testid="search-start-editor">
      <input type="hidden" name="eventId" value={eventId} />
      <SearchStartField defaultDate={searchStartDate} minDate={today} maxDate={lastBeforeEvent} />
      {state.error !== undefined ? (
        <p role="alert" className="rounded-xl bg-semantic-error/10 px-4 py-2 text-sm text-semantic-error">{state.error}</p>
      ) : null}
      {state.saved === true ? <p role="status" className="text-sm text-vinho/75">Data da busca salva.</p> : null}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar data da busca"}</Button>
      </div>
    </form>
  );
}
