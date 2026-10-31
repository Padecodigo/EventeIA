"use client";

import { useActionState, useState } from "react";

import { setPasswordAction, type PasswordState } from "@/app/(dashboard)/perfil/password-actions";
import { PASSWORD_MIN_LENGTH, passwordStrength } from "@/lib/auth/password";

const initialState: PasswordState = {};

const inputClass =
  "h-12 w-full rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho";

export function PasswordForm({
  hasPassword,
  submitLabel,
}: {
  hasPassword: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(setPasswordAction, initialState);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const strength = password.length > 0 ? passwordStrength(password) : null;
  const label = submitLabel ?? (hasPassword ? "Alterar senha" : "Criar senha");

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4" aria-label={label}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium text-vinho">
          Nova senha
        </label>
        <input
          id="new-password"
          name="password"
          type={visible ? "text" : "password"}
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="text-caption text-vinho/70" aria-live="polite">
          Mínimo de {PASSWORD_MIN_LENGTH} caracteres.
          {strength !== null ? ` Força: ${strength}.` : null}
          {strength === "fraca" || strength === "média"
            ? " Misture maiúsculas, números e símbolos."
            : null}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium text-vinho">
          Confirmar senha
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type={visible ? "text" : "password"}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-vinho/80">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Mostrar senhas
      </label>

      {state.needsNonce ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nonce" className="text-sm font-medium text-vinho">
            Código enviado por e-mail
          </label>
          <input
            id="nonce"
            name="nonce"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            className={inputClass}
          />
        </div>
      ) : null}

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
        {pending ? "Salvando…" : label}
      </button>
    </form>
  );
}
