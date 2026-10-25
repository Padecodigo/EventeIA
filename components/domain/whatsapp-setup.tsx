"use client";

import { useState, useTransition } from "react";

import { saveWhatsappNumberModeAction } from "@/app/(dashboard)/eventos/actions";
import { QuotePreparingNotice } from "@/components/domain/quote-preparing-notice";
import { WhatsappConnect } from "@/components/domain/whatsapp-connect";
import { Button } from "@/components/ui/button";

type Mode = "dedicated" | "personal";

const OPTIONS: readonly { value: Mode; title: string; body: string }[] = [
  {
    value: "dedicated",
    title: "Número dedicado (recomendado)",
    body: "Use um segundo chip só para o EventeIA. Seu WhatsApp pessoal fica intocado.",
  },
  {
    value: "personal",
    title: "Meu número pessoal",
    body: "Conecte agora pelo QR code. As conversas com fornecedores são arquivadas automaticamente.",
  },
];

/**
 * Passo único de WhatsApp: escolher a opção já persiste (sem "Salvar").
 * - dedicado: uma confirmação e pronto;
 * - pessoal: QR/código aparecem na hora; ao conectar, "Conectado! Podemos prosseguir?".
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
  const [dedicatedDone, setDedicatedDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  if (connected) return <QuotePreparingNotice />;

  function persist(next: Mode, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveWhatsappNumberModeAction(eventId, next);
        if (result.error !== undefined) {
          setError(result.error);
          return;
        }
        after?.();
      } catch {
        setError("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  function choose(next: Mode) {
    setMode(next);
    setDedicatedDone(false);
    if (next === "personal") persist("personal");
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

      {mode === "dedicated" ? (
        dedicatedDone ? (
          <QuotePreparingNotice />
        ) : (
          <div>
            <Button
              type="button"
              disabled={saving}
              onClick={() => persist("dedicated", () => setDedicatedDone(true))}
            >
              Confirmar número dedicado
            </Button>
          </div>
        )
      ) : null}

      {mode === "personal" ? <WhatsappConnect eventId={eventId} autoStart /> : null}
    </div>
  );
}
