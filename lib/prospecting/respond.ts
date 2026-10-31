import type { DeepSeekClient } from "@/lib/deepseek/client";
import { logger } from "@/lib/logger";

import type { AgentContext, AgentMessage, AgentReply } from "./agent";
import { runAgent } from "./agent-runtime";
import type { HandleInboundResult } from "./inbound";
import type { StructuredQuote } from "./quote";

/**
 * Aplica a resposta do agente aos efeitos de domínio: responde na DM, salva a
 * cotação, marca opt-out ou escala ao humano. Puro e testável via `RespondPorts`.
 */

export interface RespondPorts {
  /** Retorna true quando a DM foi efetivamente enviada (false = falha de envio). */
  sendReply(conversationId: string, text: string): Promise<boolean>;
  saveQuote(conversationId: string, supplierId: string | null, quote: StructuredQuote): Promise<void>;
  markOptOut(conversationId: string, supplierId: string | null): Promise<void>;
  escalate(conversationId: string, reason: string): Promise<void>;
}

export type RespondAction = "opt_out" | "escalated" | "quoted" | "done" | "replied";

export interface ApplyResult {
  action: RespondAction;
  sent: boolean;
}

/** Formata centavos em BRL com aritmética inteira (apenas exibição, sem cálculo). */
export function formatCentsBRL(cents: number): string {
  const reais = Math.floor(cents / 100);
  const frac = cents % 100;
  return `R$ ${String(reais)},${String(frac).padStart(2, "0")}`;
}

/** Motivo determinístico de violação do teto, ou null quando dentro dos critérios. */
export function quoteOverLimitReason(
  quote: StructuredQuote,
  maxPriceCents?: number,
  maxDeadlineDays?: number,
): string | null {
  if (maxPriceCents !== undefined) {
    if (quote.priceCents === null || quote.priceCents > maxPriceCents) {
      const ceiling = formatCentsBRL(maxPriceCents);
      const value = quote.priceCents === null ? "sem preço" : formatCentsBRL(quote.priceCents);
      return `preço ${value} acima do teto ${ceiling}`;
    }
  }
  if (maxDeadlineDays !== undefined) {
    if (quote.deadlineDays === null || quote.deadlineDays > maxDeadlineDays) {
      const value = quote.deadlineDays === null ? "não informado" : `${String(quote.deadlineDays)} dias`;
      return `prazo ${value} acima de ${String(maxDeadlineDays)} dias`;
    }
  }
  return null;
}

/**
 * Guarda de opt-out (LGPD): decide se o agente pode responder a uma entrada já
 * tratada. O opt-out determinístico é responsabilidade de `handleInbound` (via
 * `isOptOut`); aqui apenas evitamos disparar o agente quando a conversa já está
 * optada-fora ou quando a mensagem é um pedido de parada.
 */
export function shouldAgentRespond(outcome: HandleInboundResult): boolean {
  if (!outcome.recorded) return false;
  if (outcome.action.action === "opt_out") return false;
  if (outcome.conversation.status === "opted_out") return false;
  return true;
}

export async function applyAgentReply(
  ports: RespondPorts,
  input: {
    conversationId: string;
    supplierId: string | null;
    reply: AgentReply;
    maxPriceCents?: number;
    maxDeadlineDays?: number;
  },
): Promise<ApplyResult> {
  const { reply, conversationId, supplierId } = input;

  // O opt-out determinístico é tratado em `handleInbound`. O sinal `optOut` do
  // LLM é só uma dica: NÃO desinscreve o fornecedor (falsos positivos do modelo
  // causavam cancelamento silencioso) — apenas escala para revisão humana.
  if (reply.optOut) {
    await ports.escalate(conversationId, "possível opt-out sinalizado pela IA — revisar");
    return { action: "escalated", sent: false };
  }

  // Teto determinístico (não depende do julgamento do LLM): cotação acima do
  // orçamento/prazo escalada SEMPRE, mesmo que o modelo marque done=true.
  if (reply.quote !== null) {
    const overLimit = quoteOverLimitReason(reply.quote, input.maxPriceCents, input.maxDeadlineDays);
    if (overLimit !== null) {
      await ports.escalate(conversationId, overLimit);
      return { action: "escalated", sent: false };
    }
  }

  const quoted = reply.quote !== null;
  if (reply.quote !== null) {
    await ports.saveQuote(conversationId, supplierId, reply.quote);
  }

  if (reply.escalate) {
    await ports.escalate(conversationId, "proposta fora dos critérios");
    const sent = await ports.sendReply(conversationId, reply.reply);
    return { action: "escalated", sent };
  }

  const sent = await ports.sendReply(conversationId, reply.reply);
  if (quoted) return { action: "quoted", sent };
  if (reply.done) return { action: "done", sent };
  return { action: "replied", sent };
}

export interface RespondInput {
  client: DeepSeekClient;
  context: AgentContext;
  history: readonly AgentMessage[];
  ports: RespondPorts;
  conversationId: string;
  supplierId: string | null;
}

/** Roda o agente e aplica o resultado; escala ao humano quando a saída é inválida. */
export async function respondToInbound(input: RespondInput): Promise<ApplyResult> {
  const reply = await runAgent({ client: input.client, context: input.context, history: input.history });
  if (reply === null) {
    logger.warn({ conversationId: input.conversationId }, "prospecção: saída inválida da IA — escalando");
    await input.ports.escalate(input.conversationId, "saída inválida da IA");
    return { action: "escalated", sent: false };
  }
  return applyAgentReply(input.ports, {
    conversationId: input.conversationId,
    supplierId: input.supplierId,
    reply,
    maxPriceCents: input.context.maxPriceCents,
    maxDeadlineDays: input.context.maxDeadlineDays,
  });
}
