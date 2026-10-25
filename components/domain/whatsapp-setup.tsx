"use client";

import { useState, useTransition } from "react";

import { saveWhatsappNumberModeAction } from "@/app/(dashboard)/eventos/actions";
import { QuotePreparingNotice } from "@/components/domain/quote-preparing-notice";
import { WhatsappConnect } from "@/components/domain/whatsapp-connect";

type Mode = "dedicated" | "personal";

const OPTIONS: readonly { value: Mode; title: string; body: string }[] = [
  {
    value: "dedicated",
    title: "Número dedicado (recomendado)",
    body: "Um segundo chip seu, só para o EventeIA. Conecte agora pelo QR code.",
  },
  {
    value: "personal",
    title: "Meu número pessoal",
    body: "Conecte agora pelo QR code. As conversas com fornecedores são arquivadas automaticamente.",
  },
];

/**
 * Passo único de WhatsApp: escolher a opção já persiste (sem "Salvar").
 * ambas as opções são números do próprio usuário: o QR/código aparece na hora
 * (número só se preciso para o código) e, ao conectar, "Conectado! Podemos prosseguir?".
 */
export function WhatsappSetup({
  eventId,
  current,
  connected,
}: {
  eventId: string;
  current: Mode | null;
  connected: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(connected ? current : null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (connected) return <QuotePreparingNotice />;

  function persist(next: Mode) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveWhatsappNumberModeAction(eventId, next);
        if (result.error !== undefined) {
          setError(result.error);
          return;
        }
      } catch {
        setError("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  function choose(next: Mode) {
    setMode(next);
    persist(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Qual WhatsApp o agente deve usar?"
        className="grid gap-3 md:grid-cols-2"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => choose(option.value)}
            className="flex flex-col rounded-xl border border-line-subtle bg-areia-quente px-4 py-3 text-left aria-checked:border-vinho"
          >
            <span className="block font-medium text-vinho">{option.title}</span>
            <span className="mt-1 block text-sm leading-6 text-vinho/75">{option.body}</span>
          </button>
        ))}
      </div>

      {error !== null ? (
        <p role="alert" className="text-sm text-semantic-error">
          {error}
        </p>
      ) : null}

      {mode !== null ? <WhatsappConnect key={mode} eventId={eventId} autoStart /> : null}
    </div>
  );
}
