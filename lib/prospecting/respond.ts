import type { DeepSeekClient } from "@/lib/deepseek/client";

import type { AgentContext, AgentMessage, AgentReply } from "./agent";
import { runAgent } from "./agent-runtime";
import type { HandleInboundResult } from "./inbound";
import type { StructuredQuote } from "./quote";

/**
 * Aplica a resposta do agente aos efeitos de domínio: responde na DM, salva a
 * cotação, marca opt-out ou escala ao humano. Puro e testável via `RespondPorts`.
 */

export interface RespondPorts {
  sendReply(conversationId: string, text: string): Promise<void>;
  saveQuote(conversationId: string, supplierId: string | null, quote: StructuredQuote): Promise<void>;
  markOptOut(conversationId: string, supplierId: string | null): Promise<void>;
  escalate(conversationId: string, reason: string): Promise<void>;
}

export type RespondAction = "opt_out" | "escalated" | "quoted" | "done" | "replied";

export interface ApplyResult {
  action: RespondAction;
  sent: boolean;
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
  input: { conversationId: string; supplierId: string | null; reply: AgentReply },
): Promise<ApplyResult> {
  const { reply, conversationId, supplierId } = input;

  // O opt-out determinístico é tratado em `handleInbound`. O sinal `optOut` do
  // LLM é só uma dica: NÃO desinscreve o fornecedor (falsos positivos do modelo
  // causavam cancelamento silencioso) — apenas escala para revisão humana.
  if (reply.optOut) {
    await ports.escalate(conversationId, "possível opt-out sinalizado pela IA — revisar");
    return { action: "escalated", sent: false };
  }

  const quoted = reply.quote !== null;
  if (reply.quote !== null) {
    await ports.saveQuote(conversationId, supplierId, reply.quote);
  }

  if (reply.escalate) {
    await ports.escalate(conversationId, "proposta fora dos critérios");
    await ports.sendReply(conversationId, reply.reply);
    return { action: "escalated", sent: true };
  }

  await ports.sendReply(conversationId, reply.reply);
  if (quoted) return { action: "quoted", sent: true };
  if (reply.done) return { action: "done", sent: true };
  return { action: "replied", sent: true };
}

export interface RespondInput {
  client: DeepSeekClient;
  context: AgentContext;
  history: readonly AgentMessage[];
  ports: RespondPorts;
  conversationId: string;
  supplierId: string | null;
}

/** Roda o agente e aplica o resultado; null quando o modelo devolve algo inválido. */
export async function respondToInbound(input: RespondInput): Promise<ApplyResult | null> {
  const reply = await runAgent({ client: input.client, context: input.context, history: input.history });
  if (reply === null) return null;
  return applyAgentReply(input.ports, {
    conversationId: input.conversationId,
    supplierId: input.supplierId,
    reply,
  });
}
