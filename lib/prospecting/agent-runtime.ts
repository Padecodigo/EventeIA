import type { DeepSeekClient } from "@/lib/deepseek/client";

import {
  buildAgentMessages,
  parseAgentReply,
  type AgentContext,
  type AgentMessage,
  type AgentReply,
} from "./agent";

/**
 * Executa o agente sobre o histórico da conversa e devolve a resposta já
 * validada. O client é injetável (live em produção, mock nos testes).
 */
export async function runAgent(input: {
  client: DeepSeekClient;
  context: AgentContext;
  history: readonly AgentMessage[];
}): Promise<AgentReply | null> {
  const messages = buildAgentMessages(input.context, input.history);
  const raw = await input.client.complete({ messages });
  return parseAgentReply(raw);
}
