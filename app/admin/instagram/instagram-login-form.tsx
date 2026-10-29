"use client";

import { useActionState } from "react";

import type { OpResult } from "@/lib/admin/suppliers";

import { loginInstagramAction } from "./actions";

const initialState: OpResult | null = null;

export function InstagramLoginForm() {
  const [state, formAction, pending] = useActionState(loginInstagramAction, initialState);

  return (
    <form action={formAction} className="mt-4 flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-vinho">
        Usuário (sem @)
        <input
          name="username"
          required
          autoComplete="username"
          className="h-11 rounded-xl border border-line-subtle bg-white px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-vinho">
        Senha
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-11 rounded-xl border border-line-subtle bg-white px-3 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-primaria px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primaria-escura disabled:opacity-50"
      >
        {pending ? "Entrando no Instagram…" : "Logar"}
      </button>
      {state !== null && !state.ok ? (
        <p role="alert" className="text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state !== null && state.ok ? (
        <p className="text-sm text-vinho/75">Sessão salva. A automação já pode publicar ✅</p>
      ) : null}
    </form>
  );
}
