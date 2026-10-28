import type { DeepSeekClient } from "@/lib/deepseek/client";

import type { AgentContext, AgentMessage, AgentReply } from "./agent";
import { runAgent } from "./agent-runtime";
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

export async function applyAgentReply(
  ports: RespondPorts,
  input: { conversationId: string; supplierId: string | null; reply: AgentReply },
): Promise<ApplyResult> {
  const { reply, conversationId, supplierId } = input;

  if (reply.optOut) {
    await ports.markOptOut(conversationId, supplierId);
    await ports.sendReply(conversationId, reply.reply);
    return { action: "opt_out", sent: true };
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
