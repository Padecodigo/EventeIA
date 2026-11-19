"use client";

import { useActionState } from "react";

import { changeEmailAction, type EmailChangeState } from "@/app/(dashboard)/perfil/email-actions";

const initialState: EmailChangeState = {};

const inputClass =
  "h-12 w-full rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho";

export function EmailChangeForm() {
  const [state, formAction, pending] = useActionState(changeEmailAction, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4" aria-label="Alterar e-mail">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-email" className="text-sm font-medium text-vinho">
          Novo e-mail
        </label>
        <input
          id="new-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
        <p className="text-caption text-vinho/70">
          Enviaremos um link de confirmação para o e-mail novo. A troca só vale depois que você
          confirmar.
        </p>
      </div>

      {state.error !== undefined ? (
        <p
          role="alert"
          className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
        >
          {state.error}
        </p>
      ) : null}
      {state.success !== undefined ? (
        <p role="status" className="rounded-xl bg-champagne-claro/50 px-4 py-3 text-sm text-vinho">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-full bg-primaria px-6 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Alterar e-mail"}
      </button>
    </form>
  );
}
