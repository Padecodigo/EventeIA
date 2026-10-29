"use client";

import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_SIGNUP_MESSAGE,
  instagramDmUrl,
  instagramProfileUrl,
} from "@/lib/social/contact";

export interface InstagramStepProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * Passo obrigatório do cadastro: seguir a EventeIA e enviar uma DM no Instagram.
 * Durante a prospecção, o contato com o cliente acontece várias vezes por lá —
 * por isso o passo é bloqueante antes de criar a conta.
 */
export function InstagramStep({ checked, onChange, className }: InstagramStepProps) {
  return (
    <div className={`rounded-card border border-champagne/40 bg-areia-quente/70 p-4 ${className ?? ""}`}>
      <p className="text-sm font-medium text-vinho">Conecte-se com a gente no Instagram</p>
      <p className="mt-1 text-caption text-vinho/70">
        Durante a prospecção vamos falar com você várias vezes por lá. Faça os dois passos abaixo.
      </p>

      <ol className="mt-3 flex flex-col gap-2 text-sm text-vinho">
        <li className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-champagne text-xs font-semibold text-primaria-escura">
            1
          </span>
          <a
            href={instagramProfileUrl()}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline decoration-champagne underline-offset-4"
          >
            Siga @{INSTAGRAM_HANDLE}
          </a>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-champagne text-xs font-semibold text-primaria-escura">
            2
          </span>
          <a
            href={instagramDmUrl(INSTAGRAM_HANDLE, INSTAGRAM_SIGNUP_MESSAGE)}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline decoration-champagne underline-offset-4"
          >
            Envie uma mensagem para @{INSTAGRAM_HANDLE}
          </a>
        </li>
      </ol>

      <div className="mt-3 flex items-start gap-2 text-sm text-vinho/80">
        <input
          id="instagram-confirm"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-vinho"
        />
        <label htmlFor="instagram-confirm">
          Já sigo @{INSTAGRAM_HANDLE} e enviei uma mensagem.
        </label>
      </div>
    </div>
  );
}
