import {
  canSend,
  type SendGuardConversation,
} from "@/lib/outreach/send-guard";

import { nextStatus, type SelectionStatus } from "./state";

/**
 * Decisão de relay da escolha do usuário ao fornecedor — pura e determinística.
 *
 * O relay só acontece DENTRO da janela aberta (send-guard) e em horário comercial.
 * Nunca faz abordagem fria: se a janela fechou ou o fornecedor pediu opt-out, a
 * seleção vira `canal_fechado`/`indisponivel` e o usuário segue com outro fornecedor.
 */

export type RelayAction = "send" | "wait" | "close";

export type RelayBlockReason =
  | "opted_out"
  | "canal_fechado"
  | "window_closed"
  | "outside_business_hours";

export interface RelayDecision {
  action: RelayAction;
  nextStatus: SelectionStatus;
  reason?: RelayBlockReason;
}

/**
 * Decide o que fazer com uma seleção `status` frente à conversa do fornecedor em `now`:
 * - `send`  → pode enviar agora (janela aberta + horário comercial) → `enviado_ao_fornecedor`;
 * - `close` → janela vencida/opt-out → `canal_fechado` (ou `indisponivel` no opt-out);
 * - `wait`  → fora do horário comercial, ou estado não-relayável → mantém o estado.
 */
export function relayDecision(
  status: SelectionStatus,
  conversation: SendGuardConversation,
  now: Date,
): RelayDecision {
  // Fornecedor já contatado e sem resposta até a janela vencer → indisponível.
  if (status === "enviado_ao_fornecedor" || status === "aguardando_resposta") {
    const contact = canSend(conversation, now);
    if (!contact.ok && contact.reason !== "outside_business_hours") {
      return {
        action: "close",
        nextStatus: nextStatus(status, { type: "indisponivel" }),
        reason: contact.reason,
      };
    }
    return { action: "wait", nextStatus: status };
  }

  if (status !== "pendente") {
    return { action: "wait", nextStatus: status };
  }

  const decision = canSend(conversation, now);
  if (decision.ok) {
    return { action: "send", nextStatus: nextStatus(status, { type: "enviar" }) };
  }

  if (decision.reason === "outside_business_hours") {
    return { action: "wait", nextStatus: status, reason: decision.reason };
  }

  if (decision.reason === "opted_out") {
    return {
      action: "close",
      nextStatus: nextStatus(status, { type: "indisponivel" }),
      reason: decision.reason,
    };
  }

  return {
    action: "close",
    nextStatus: nextStatus(status, { type: "janela_fechada" }),
    reason: decision.reason,
  };
}

/** Mensagem humana (pt-BR) enviada ao fornecedor confirmando a escolha — sem URLs e sem rodapé de bot. */
export function buildSelectionMessage(input: {
  supplierName: string;
  eventTitle: string;
  optionName: string;
  priceFormatted: string;
}): string {
  const supplier = input.supplierName.trim().slice(0, 60) || "olá";
  const option = input.optionName.trim().slice(0, 120);
  const price = input.priceFormatted.trim();
  const priceText = price.length > 0 ? ` (${price})` : "";
  return `Olá, ${supplier}! Para o evento "${input.eventTitle}", escolhemos a opção "${option}"${priceText}. Podemos seguir com o fechamento?`;
}
