import { isOptOut } from "./opt-out";

/**
 * Roteamento de webhooks do Meta para a ação correta:
 * - comentário com a palavra-chave → private reply;
 * - mensagem direta → abrir conversa;
 * - pedido de parada → opt-out;
 * - qualquer outro caso → ignorar.
 */

export type InboundEvent =
  | { kind: "comment"; commentId: string; senderId: string; text: string }
  | { kind: "message"; messageId: string; senderId: string; text: string };

export type RoutedAction =
  | { action: "opt_out" }
  | { action: "private_reply"; commentId: string }
  | { action: "open_conversation"; messageId: string }
  | { action: "ignore"; reason: "no_keyword" };

export function routeInbound(event: InboundEvent, options: { keyword: string }): RoutedAction {
  if (isOptOut(event.text)) return { action: "opt_out" };

  if (event.kind === "message") {
    return { action: "open_conversation", messageId: event.messageId };
  }

  const keyword = options.keyword.trim().toLowerCase();
  if (keyword.length > 0 && event.text.toLowerCase().includes(keyword)) {
    return { action: "private_reply", commentId: event.commentId };
  }

  return { action: "ignore", reason: "no_keyword" };
}
