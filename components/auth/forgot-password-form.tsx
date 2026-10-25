"use client";

import Link from "next/link";

import { useActionState } from "react";

import { requestPasswordResetAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  return (
    <div>
      <h1 className="font-serif text-title-1">Esqueci minha senha</h1>
      <p className="mt-2 text-sm text-vinho/70">
        Informe o seu e-mail e enviaremos um link para criar uma nova senha. Vale também para quem
        criou a conta com o Google.
      </p>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <label htmlFor="email" className="text-sm font-medium text-vinho">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
        {state.error !== undefined ? (
          <p
            role="alert"
            className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {state.error}
          </p>
        ) : null}
        {state.notice !== undefined ? (
          <p
            role="status"
            className="rounded-xl bg-champagne-claro/50 px-4 py-3 text-sm text-vinho"
          >
            {state.notice}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-full bg-primaria text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar link"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-vinho/70">
        <Link href="/entrar" className="font-medium text-vinho underline underline-offset-4">
          Voltar para entrar
        </Link>
      </p>
    </div>
  );
}
