"use client";

import { useActionState, useState } from "react";

import {
  createTestimonialInviteAction,
  type TestimonialInviteState,
} from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";

const initialState: TestimonialInviteState = {};

export function TestimonialInvite({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(createTestimonialInviteAction, initialState);
  const [copied, setCopied] = useState(false);

  async function copyLink(): Promise<void> {
    if (state.url === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-areia-quente p-4">
      <p className="text-sm font-medium text-vinho">Depois da festa, a história fica.</p>
      <p className="mt-1 text-caption leading-5 text-vinho/70">
        Gere um convite para contar como foi. Revisamos o texto e publicamos apenas com a sua
        autorização — você pode pedir correção ou remoção depois.
      </p>

      {state.url !== undefined ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            readOnly
            value={state.url}
            aria-label="Link do convite de depoimento"
            className="h-10 rounded-lg border border-line-subtle bg-off-white px-3 text-xs text-vinho"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => { void copyLink(); }}>
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <a
              href={state.url}
              className="text-sm font-medium text-vinho underline decoration-champagne underline-offset-4"
            >
              Abrir formulário
            </a>
          </div>
          <p className="text-caption text-vinho/70">Válido por 30 dias · uso único.</p>
        </div>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="eventId" value={eventId} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Gerando…" : "Criar convite de depoimento"}
          </Button>
        </form>
      )}

      {state.error !== undefined ? (
        <p role="alert" className="mt-3 rounded-lg bg-semantic-error/10 px-3 py-2 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
