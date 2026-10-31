"use client";

import Link from "next/link";

import { useActionState, useState } from "react";

import {
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { TermsCheckbox } from "@/components/legal/terms-checkbox";
import { TERMS_FIELD } from "@/lib/legal/terms";

type AuthMode = "entrar" | "registrar";

const initialState: AuthActionState = {};

export function AuthForm({ mode, oauthError }: { mode: AuthMode; oauthError?: string }) {
  const isSignUp = mode === "registrar";
  const [state, formAction, pending] = useActionState(
    isSignUp ? signUpAction : signInAction,
    initialState,
  );
  const [googleState, googleAction, googlePending] = useActionState(
    signInWithGoogleAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const termsBlocked = isSignUp && !acceptedTerms;
  const termsHidden =
    isSignUp && acceptedTerms ? <input type="hidden" name={TERMS_FIELD} value="on" /> : null;
  const googleError = googleState.error ?? oauthError;

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

      {isSignUp ? (
        <TermsCheckbox
          id="accept-terms"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          className="mt-6"
        />
      ) : null}

      <form action={googleAction} className={isSignUp ? "mt-4" : "mt-8"}>
        {isSignUp ? <input type="hidden" name="intent" value="signup" /> : null}
        {termsHidden}
        <button
          type="submit"
          disabled={googlePending || termsBlocked}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-primaria text-base font-semibold text-white shadow-[0_10px_24px_-12px_rgba(163,72,90,0.7)] transition hover:bg-primaria-escura disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white">
            <GoogleIcon />
          </span>
          {googlePending
            ? "Abrindo o Google…"
            : isSignUp
              ? "Criar conta com Google"
              : "Entrar com Google"}
        </button>
        <p className="mt-2 text-center text-caption text-vinho/70">
          Um clique, sem senha. Avisamos no seu e-mail quando o orçamento ficar pronto.
        </p>
        {googleError !== undefined ? (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {googleError}
          </p>
        ) : null}
      </form>

      <div className="my-6 flex items-center gap-3 text-caption uppercase tracking-[0.14em] text-vinho/60">
        <span className="h-px flex-1 bg-line-subtle" />
        ou com e-mail e senha
        <span className="h-px flex-1 bg-line-subtle" />
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {termsHidden}
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
          ) : (
            <Link
              href="/esqueci-senha"
              className="self-end text-caption font-medium text-vinho underline decoration-champagne underline-offset-4"
            >
              Esqueci minha senha
            </Link>
          )}
        </div>

        {state.error !== undefined ? (
          <p
            role="alert"
            className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
          >
            {state.error}
          </p>
        ) : null}

        {state.notice !== undefined ? (
          <p className="rounded-xl bg-champagne-claro/50 px-4 py-3 text-sm text-vinho">
            {state.notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || termsBlocked}
          className="mt-2 h-12 rounded-full border border-primaria/40 bg-off-white text-sm font-semibold text-primaria transition hover:bg-areia-secundaria/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Aguarde…" : isSignUp ? "Criar conta com e-mail" : "Entrar com e-mail"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-vinho/70">
        {isSignUp ? (
          <>
            Já tem conta?{" "}
            <Link
              href="/entrar"
              className="font-medium text-vinho underline decoration-champagne underline-offset-4"
            >
              Entrar
            </Link>
          </>
        ) : (
          <>
            Ainda não tem conta?{" "}
            <Link
              href="/registrar"
              className="font-medium text-vinho underline decoration-champagne underline-offset-4"
            >
              Criar conta
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7Z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.1Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48Z"
      />
    </svg>
  );
}
