"use client";

import { useActionState } from "react";

import { createEventAction, type ActionState } from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const initialState: ActionState = {};

export function NewEventForm() {
  const [state, formAction, pending] = useActionState(createEventAction, initialState);

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-2">Novo evento</h2>
      <p className="mt-1 text-sm text-vinho/75">
        Rascunhar é gratuito. A ativação acontece quando você comprar o tíquete do evento.
      </p>

      <form action={formAction} className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Nome do evento" name="title" required placeholder="Festa de 5 anos da Lia" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-type" className="text-sm font-medium text-vinho">
            Tipo
          </label>
          <select
            id="event-type"
            name="eventType"
            required
            className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
            defaultValue="festa_infantil"
          >
            <option value="festa_infantil">Festa infantil</option>
            <option value="quinze_anos">15 anos</option>
            <option value="casamento">Casamento</option>
            <option value="aniversario">Aniversário</option>
            <option value="batizado">Batizado</option>
            <option value="formatura">Formatura</option>
            <option value="corporativo">Corporativo</option>
          </select>
        </div>

        <Field label="Data do evento" name="eventDate" type="date" required />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="region" className="text-sm font-medium text-vinho">
            Região
          </label>
          <select
            id="region"
            name="region"
            required
            className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
            defaultValue="sp"
          >
            <option value="sp">São Paulo</option>
            <option value="rj">Rio de Janeiro</option>
            <option value="mg">Minas Gerais</option>
            <option value="outros">Outras regiões</option>
          </select>
        </div>

        <Field
          label="Convidados"
          name="guestCount"
          type="number"
          min={1}
          max={5000}
          required
          defaultValue={120}
        />

        {state.error !== undefined ? (
          <p role="alert" className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
            {state.error}
          </p>
        ) : null}

        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Calculando…" : "Criar evento"}
          </Button>
        </div>
      </form>
    </section>
  );
}
