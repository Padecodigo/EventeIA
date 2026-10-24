"use client";

import { useActionState } from "react";

import { setWhatsappNumberModeAction, type NumberModeState } from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";

const initialState: NumberModeState = {};

const OPTIONS = [
  {
    value: "dedicated",
    title: "Número dedicado (recomendado)",
    body: "Use um segundo chip só para o EventeIA. Seu WhatsApp pessoal fica intocado e o risco de bloqueio não afeta suas conversas.",
  },
  {
    value: "personal",
    title: "Meu número pessoal",
    body: "As conversas com fornecedores são arquivadas automaticamente para não misturar com seus contatos.",
  },
] as const;

export function WhatsappModeForm({ eventId, current }: { eventId: string; current: "dedicated" | "personal" | null }) {
  const [state, formAction, pending] = useActionState(setWhatsappNumberModeAction, initialState);
  const selected = state.saved ?? current ?? "dedicated";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="sr-only">Qual WhatsApp o agente deve usar?</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-3 rounded-xl border border-line-subtle bg-areia-quente px-4 py-3 has-[:checked]:border-vinho"
          >
            <input type="radio" name="mode" value={option.value} defaultChecked={selected === option.value} className="mt-1" />
            <span>
              <span className="block font-medium text-vinho">{option.title}</span>
              <span className="mt-1 block text-sm leading-6 text-vinho/75">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar e conectar"}
        </Button>
        {state.error !== undefined ? (
          <p role="alert" className="text-sm text-semantic-error">{state.error}</p>
        ) : state.saved !== undefined ? (
          <p role="status" className="text-sm text-vinho/75">Preferência salva.</p>
        ) : null}
      </div>
    </form>
  );
}
