"use client";

import { useActionState, useState } from "react";

import {
  updateEventDetailsAction,
  type EventDetailsState,
} from "@/app/(dashboard)/eventos/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  EVENT_STYLES,
  EVENT_STYLE_LABELS,
  SPACE_TYPES,
  SPACE_TYPE_LABELS,
  venueCapacityWarning,
} from "@/lib/catalog/v1";

const initialState: EventDetailsState = {};

export interface EventDetailsEditorProps {
  eventId: string;
  guestCount: number;
  venueCapacity: number | null;
  venueType: string | null;
  eventStyle: string | null;
}

/** Edição pós-criação: convidados, capacidade/tipo do local e estilo da festa. */
export function EventDetailsEditor({
  eventId,
  guestCount,
  venueCapacity,
  venueType,
  eventStyle,
}: EventDetailsEditorProps) {
  const [state, formAction, pending] = useActionState(updateEventDetailsAction, initialState);
  const [guests, setGuests] = useState(String(guestCount));
  const [capacity, setCapacity] = useState(venueCapacity === null ? "" : String(venueCapacity));

  const capacityNumber = capacity.trim() === "" ? null : Number(capacity);
  const warning = venueCapacityWarning(
    capacityNumber !== null && Number.isFinite(capacityNumber) ? capacityNumber : null,
    Number(guests),
  );

  return (
    <section
      data-testid="event-details-editor"
      className="scroll-mt-24 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft"
    >
      <h2 className="font-serif text-title-2">Dados do evento</h2>
      <p className="mt-1 text-sm text-vinho/75">
        Ajuste convidados, local e estilo sempre que precisar. A entrevista usa o número de
        convidados para dimensionar equipe, louça e buffet.
      </p>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <input type="hidden" name="eventId" value={eventId} />
        <Field
          label="Convidados"
          name="guestCount"
          type="number"
          min={1}
          max={5000}
          required
          value={guests}
          onChange={(event) => setGuests(event.target.value)}
        />
        <Field
          label="Capacidade do local"
          name="venueCapacity"
          type="number"
          min={1}
          max={100000}
          placeholder="Ex.: 120"
          hint="Opcional. Avisamos se o local for menor que o número de convidados."
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-venue-type" className="text-sm font-medium text-vinho">
            Tipo de local
          </label>
          <select
            id="event-venue-type"
            name="venueType"
            defaultValue={venueType ?? ""}
            className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
          >
            <option value="">Não informado</option>
            {SPACE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SPACE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-style" className="text-sm font-medium text-vinho">
            Estilo
          </label>
          <select
            id="event-style"
            name="eventStyle"
            defaultValue={eventStyle ?? ""}
            className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
          >
            <option value="">Não informado</option>
            {EVENT_STYLES.map((style) => (
              <option key={style} value={style}>
                {EVENT_STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </div>

        {warning !== null ? (
          <p
            role="status"
            data-testid="venue-capacity-warning"
            className="md:col-span-2 rounded-xl bg-champagne/30 px-4 py-3 text-sm text-vinho"
          >
            {warning}
          </p>
        ) : null}

        {state.error !== undefined ? (
          <p
            role="alert"
            className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved === true ? (
          <p role="status" className="md:col-span-2 text-sm text-vinho/75">
            Dados do evento salvos.
          </p>
        ) : null}

        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar dados do evento"}
          </Button>
        </div>
      </form>
    </section>
  );
}
