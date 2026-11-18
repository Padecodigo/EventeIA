"use client";

import { useActionState } from "react";

import {
  linkFacebookAction,
  unlinkFacebookAction,
  type IdentityActionState,
} from "@/app/(dashboard)/perfil/identity-actions";

const initialState: IdentityActionState = {};

export function ConnectedAccounts({
  facebookLoginEnabled,
  hasFacebook,
  hasGoogle,
  canUnlinkFacebook,
}: {
  facebookLoginEnabled: boolean;
  hasFacebook: boolean;
  hasGoogle: boolean;
  canUnlinkFacebook: boolean;
}) {
  const [linkState, linkAction, linkPending] = useActionState(linkFacebookAction, initialState);
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkFacebookAction,
    initialState,
  );
  const message = linkState.error ?? linkState.notice ?? unlinkState.error ?? unlinkState.notice;
  const isError = Boolean(linkState.error ?? unlinkState.error);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        <li className="flex items-center justify-between gap-3 rounded-xl border border-line-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-vinho">Google</p>
            <p className="text-caption text-vinho/70">
              {hasGoogle ? "Conectado" : "Não conectado"}
            </p>
          </div>
        </li>

        {facebookLoginEnabled ? (
          <li className="flex items-center justify-between gap-3 rounded-xl border border-line-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-vinho">Facebook</p>
              <p className="text-caption text-vinho/70">
                {hasFacebook ? "Conectado" : "Não conectado"}
              </p>
            </div>
            {hasFacebook ? (
              <form action={unlinkAction}>
                <button
                  type="submit"
                  data-testid="facebook-unlink"
                  disabled={unlinkPending || !canUnlinkFacebook}
                  title={
                    canUnlinkFacebook
                      ? undefined
                      : "Crie uma senha ou conecte outra conta antes de desconectar o Facebook."
                  }
                  className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho transition hover:bg-areia-secundaria/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unlinkPending ? "Desconectando…" : "Desconectar"}
                </button>
              </form>
            ) : (
              <form action={linkAction}>
                <button
                  type="submit"
                  data-testid="facebook-link"
                  disabled={linkPending}
                  className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {linkPending ? "Abrindo o Facebook…" : "Conectar"}
                </button>
              </form>
            )}
          </li>
        ) : null}

        <li className="flex items-center justify-between gap-3 rounded-xl border border-line-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-vinho">Instagram</p>
            <p className="text-caption text-vinho/70">
              Login em breve. O @ de contato continua no formulário acima.
            </p>
          </div>
          <button
            type="button"
            data-testid="instagram-coming-soon"
            disabled
            aria-disabled="true"
            className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Em breve
          </button>
        </li>
      </ul>
      {message !== undefined ? (
        <p
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
              : "rounded-xl bg-champagne-claro/50 px-4 py-3 text-sm text-vinho"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
