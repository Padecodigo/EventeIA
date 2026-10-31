"use client";

import Link from "next/link";

import { useActionState, useState } from "react";

import {
  sendEventChatMessageAction,
  type EventChatSendState,
} from "@/app/(dashboard)/eventos/[id]/chat-actions";
import { adminSendEventChatMessageAction } from "@/app/admin/eventos/[id]/chat-actions";
import { Button } from "@/components/ui/button";
import type {
  ChatConversationView,
  ChatMessageView,
} from "@/lib/outreach/chat";

const channelLabels: Record<ChatConversationView["channel"], string> = {
  instagram: "Instagram",
  messenger: "Messenger",
};

const blockLabels: Record<string, string> = {
  opted_out: "O fornecedor pediu para não receber mensagens.",
  canal_fechado: "A janela de conversa foi encerrada.",
  window_closed: "A janela de 24 horas da Meta foi encerrada.",
  outside_business_hours: "O envio acontece em dias úteis, das 9h às 18h (horário de Brasília).",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-champagne-claro font-serif text-sm text-vinho"
    >
      {initials(name) || "F"}
    </span>
  );
}

function Bubble({
  message,
  supplierName,
  mode,
}: {
  message: ChatMessageView;
  supplierName: string;
  mode: "user" | "admin";
}) {
  const fromViewer = message.direction === "out";
  const authorLabel =
    message.author === "supplier"
      ? supplierName
      : message.author === "agent"
        ? "Equipe EventeIA"
        : message.author === "system"
          ? "EventeIA"
          : mode === "admin"
            ? "Cliente"
            : "Você";

  return (
    <li className={`flex ${fromViewer ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm sm:max-w-[75%] ${
          fromViewer
            ? "rounded-br-sm bg-primaria text-white"
            : "rounded-bl-sm border border-line-subtle bg-white text-vinho"
        }`}
      >
        <p className={`text-caption ${fromViewer ? "text-white/75" : "text-vinho/60"}`}>
          {authorLabel} · {formatDate(message.createdAt)}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
        {message.moderated ? (
          <p className={`mt-1 text-caption ${fromViewer ? "text-white/70" : "text-vinho/50"}`}>
            Contato removido pela moderação.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function Composer({
  eventId,
  conversationId,
  mode,
}: {
  eventId: string;
  conversationId: string;
  mode: "user" | "admin";
}) {
  const [state, action, pending] = useActionState<EventChatSendState, FormData>(
    mode === "admin" ? adminSendEventChatMessageAction : sendEventChatMessageAction,
    {},
  );

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="sr-only" htmlFor={`chat-message-${conversationId}`}>
        Mensagem para o fornecedor
      </label>
      <textarea
        key={state.ok === true ? "sent" : "draft"}
        id={`chat-message-${conversationId}`}
        name="body"
        required
        maxLength={2000}
        rows={3}
        placeholder="Escreva sua mensagem…"
        className="w-full rounded-xl border border-vinho/15 bg-white px-3 py-2 text-sm text-vinho focus:border-primaria focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-vinho/60">
          Telefones, e-mails e links são removidos pela moderação.
        </p>
        <Button type="submit" disabled={pending} className="px-5 py-2">
          {pending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      {state.error !== undefined ? (
        <p role="alert" className="text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state.ok === true ? (
        <p role="status" className="text-caption text-vinho/70">
          {state.masked === true
            ? "Mensagem enviada com os contatos removidos pela moderação."
            : "Mensagem enviada."}
        </p>
      ) : null}
    </form>
  );
}

function ClosedNotice({
  eventId,
  reason,
}: {
  eventId: string;
  reason: string | null;
}) {
  const closed = reason !== "outside_business_hours";
  return (
    <div role="status" className="mt-3 rounded-xl border border-line-subtle bg-areia-quente p-4 text-sm text-vinho/80">
      <p>{blockLabels[reason ?? ""] ?? "Não é possível responder a esta conversa agora."}</p>
      {closed ? (
        <Link
          href={`/eventos/${eventId}#fornecedores`}
          className="mt-2 inline-block font-semibold text-primaria underline decoration-primaria/40 underline-offset-4"
        >
          Continuar com outros fornecedores
        </Link>
      ) : null}
    </div>
  );
}

function ConversationPanel({
  eventId,
  conversation,
  mode,
}: {
  eventId: string;
  conversation: ChatConversationView;
  mode: "user" | "admin";
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line-subtle bg-areia-quente/50 p-4">
      <header className="flex items-center gap-3 border-b border-line-subtle pb-3">
        <Avatar name={conversation.supplierName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-vinho">{conversation.supplierName}</p>
          <p className="text-caption text-vinho/60">
            {channelLabels[conversation.channel]}
            {conversation.supplierCategory !== null ? ` · ${conversation.supplierCategory}` : ""}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
          {conversation.canReply ? "Janela aberta" : "Canal fechado"}
        </span>
      </header>

      <ol className="mt-3 flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1" aria-live="polite">
        {conversation.messages.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line-subtle p-4 text-sm text-vinho/70">
            Nenhuma mensagem ainda. Escreva para iniciar a conversa.
          </li>
        ) : (
          conversation.messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              supplierName={conversation.supplierName}
              mode={mode}
            />
          ))
        )}
      </ol>

      {conversation.canReply ? (
        <Composer eventId={eventId} conversationId={conversation.id} mode={mode} />
      ) : (
        <ClosedNotice eventId={eventId} reason={conversation.blockReason} />
      )}
    </div>
  );
}

/**
 * Chat mediado do evento: o usuário fala com o fornecedor pelo app, mas a
 * mensagem só é relayada dentro da janela da Meta e sempre moderada.
 */
export function EventChat({
  eventId,
  conversations,
  mode = "user",
}: {
  eventId: string;
  conversations: ChatConversationView[];
  mode?: "user" | "admin";
}) {
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  if (conversations.length === 0) return null;

  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];
  if (active === undefined) return null;

  return (
    <section id="conversas" className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <div>
        <h2 className="font-serif text-title-1">Conversas com fornecedores</h2>
        <p className="mt-2 max-w-prose text-sm text-vinho/70">
          Converse diretamente por aqui. A EventeIA media a conversa: contatos pessoais são
          removidos e a mensagem chega ao fornecedor pelo canal dele (Instagram ou Messenger).
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr] lg:items-start">
        <nav aria-label="Conversas" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {conversations.map((conversation) => {
            const selected = conversation.id === active.id;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                aria-current={selected ? "true" : undefined}
                className={`flex min-w-[180px] items-center gap-2 rounded-xl border px-3 py-2 text-left transition lg:min-w-0 ${
                  selected
                    ? "border-primaria/40 bg-verde-claro/50"
                    : "border-line-subtle bg-white hover:border-primaria/30"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-champagne-claro text-caption font-semibold text-vinho">
                  {initials(conversation.supplierName) || "F"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-vinho">
                    {conversation.supplierName}
                  </span>
                  <span className="block text-caption text-vinho/60">
                    {conversation.canReply ? "Janela aberta" : "Canal fechado"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <ConversationPanel eventId={eventId} conversation={active} mode={mode} />
      </div>
    </section>
  );
}
