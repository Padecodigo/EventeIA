"use client";

import Link from "next/link";

import { useActionState, useState } from "react";

import { signInAction, signUpAction, type AuthActionState } from "@/app/(auth)/actions";

type AuthMode = "entrar" | "registrar";

const initialState: AuthActionState = {};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const isSignUp = mode === "registrar";
  const [state, formAction, pending] = useActionState(
    isSignUp ? signUpAction : signInAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">
        {isSignUp ? "Comece agora" : "Bem-vindo de volta"}
      </p>
      <h1 className="mt-2 font-serif text-title-1">
        {isSignUp ? "Crie a sua conta" : "Entre na sua conta"}
      </h1>
      <p className="mt-2 text-sm text-vinho/70">
        {isSignUp
          ? "Um tíquete por evento ou uma franquia de créditos — você escolhe depois."
          : "Continue de onde parou e acompanhe os seus eventos."}
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        {isSignUp ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full-name" className="text-sm font-medium text-vinho">
              Nome completo
            </label>
            <input
              id="full-name"
              name="fullName"
              required
              autoComplete="name"
              className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-vinho">
            Senha
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="h-12 w-full rounded-xl border border-line-subtle bg-off-white px-4 pr-12 text-sm text-vinho"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-vinho/70 transition hover:bg-areia-secundaria/60 hover:text-vinho"
            >
              {showPassword ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M7.8 7.9C5.5 9.3 4 12 4 12s3.5 7 10 7c1.6 0 3-.4 4.2-1M9.9 5.3A10.9 10.9 0 0 1 14 4.5c6.5 0 10 7.5 10 7.5s-1 2-2.9 3.7"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {isSignUp ? (
            <p className="text-caption text-vinho/70">Mínimo de 8 caracteres.</p>
          ) : null}
        </div>

        {state.error !== undefined ? (
          <p role="alert" className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
            {state.error}
          </p>
        ) : null}

        {state.notice !== undefined ? (
          <p className="rounded-xl bg-champagne-claro/50 px-4 py-3 text-sm text-vinho">{state.notice}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-12 rounded-full bg-primaria text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(163,72,90,0.7)] transition hover:bg-primaria-escura disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Aguarde…" : isSignUp ? "Criar conta" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-vinho/70">
        {isSignUp ? (
          <>
            Já tem conta?{" "}
            <Link href="/entrar" className="font-medium text-vinho underline decoration-champagne underline-offset-4">
              Entrar
            </Link>
          </>
        ) : (
          <>
            Ainda não tem conta?{" "}
            <Link href="/registrar" className="font-medium text-vinho underline decoration-champagne underline-offset-4">
              Criar conta
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
