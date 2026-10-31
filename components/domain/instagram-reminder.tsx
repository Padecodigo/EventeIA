"use client";

import { useEffect, useState } from "react";

import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_SIGNUP_MESSAGE,
  instagramDmUrl,
  instagramProfileUrl,
} from "@/lib/social/contact";

const DISMISS_KEY = "ev_instagram_reminder_dismissed";

/**
 * Lembrete do passo do Instagram para quem não passou pelo formulário de
 * cadastro (ex.: login com Google). Pode ser dispensado; reaparece se o
 * armazenamento for limpo.
 */
export function InstagramReminderBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss(): void {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sem localStorage: só esconde nesta sessão
    }
    setVisible(false);
  }

  return (
    <div className="rounded-card border border-champagne/40 bg-areia-quente/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-vinho">Fale com a gente no Instagram</p>
          <p className="mt-1 text-caption text-vinho/70">
            Durante a prospecção vamos falar com você várias vezes por lá. Siga e envie uma mensagem.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={instagramProfileUrl()}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura"
            >
              Siga @{INSTAGRAM_HANDLE}
            </a>
            <a
              href={instagramDmUrl(INSTAGRAM_HANDLE, INSTAGRAM_SIGNUP_MESSAGE)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-vinho transition hover:bg-white/60"
            >
              Envie uma mensagem
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar lembrete do Instagram"
          className="rounded-full px-2 py-1 text-lg leading-none text-vinho/50 transition hover:text-vinho"
        >
          ×
        </button>
      </div>
    </div>
  );
}
