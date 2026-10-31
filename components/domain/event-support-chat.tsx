"use client";

import Link from "next/link";

import { useState } from "react";

import { SupportForm } from "@/components/support/support-form";
import { Button } from "@/components/ui/button";

/**
 * Canal separado de suporte: "Fale com a EventeIA".
 *
 * Não é a conversa com o fornecedor — é o atendimento da própria EventeIA.
 * Reaproveita a central de chamados (SupportForm), que já registra o evento
 * atual pelo caminho da página e acompanha a resposta em "Meus chamados".
 */
export function EventSupportChat() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vinho font-serif text-sm text-off-white"
        >
          E
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-title-2">Fale com a EventeIA</h2>
          <p className="mt-1 text-sm text-vinho/70">
            Dúvidas sobre o evento, cotações ou a plataforma? Fale com a nossa equipe — este é um
            canal separado da conversa com os fornecedores.
          </p>
        </div>
      </div>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="max-w-prose rounded-2xl rounded-bl-sm border border-line-subtle bg-areia-quente px-4 py-2 text-sm text-vinho">
            Olá! Conte o que você precisa e a equipe da EventeIA responde por aqui e por e-mail.
          </p>
          <SupportForm withEmail={false} onDone={() => setOpen(false)} />
          <Link
            href="/chamados"
            className="self-start text-caption font-semibold text-primaria underline decoration-primaria/40 underline-offset-4"
          >
            Ver meus chamados
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setOpen(true)} className="px-5 py-2">
            Abrir conversa
          </Button>
          <Link
            href="/chamados"
            className="text-caption font-semibold text-primaria underline decoration-primaria/40 underline-offset-4"
          >
            Ver meus chamados
          </Link>
        </div>
      )}
    </section>
  );
}
