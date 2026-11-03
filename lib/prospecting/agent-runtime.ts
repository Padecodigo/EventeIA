import { enforceSocialOnlyReply } from "@/lib/ai/channel-policy";
import type { DeepSeekClient } from "@/lib/deepseek/client";

import {
  buildAgentMessages,
  parseAgentReply,
  type AgentContext,
  type AgentMessage,
  type AgentReply,
} from "./agent";
import { spokenCategoryLabel } from "./reply-guard";

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
  let raw = await input.client.complete({ messages });
  if (raw.trim() === "") raw = await input.client.complete({ messages });
  if (raw.trim() === "") return emptyOutputFallback(input.context);
  return parseAgentReply(raw);
}

/**
 * Saída vazia (só espaços) duas vezes seguidas — acontece quando o fornecedor
 * insiste em WhatsApp/telefone. Em vez de ficar sem resposta, mantém a conversa
 * por aqui e pede o valor.
 */
export function emptyOutputFallback(context: Pick<AgentContext, "category">): AgentReply {
  return {
    reply: enforceSocialOnlyReply(
      `Pode ser por aqui mesmo, tá? Me manda o valor que você cobra pelo serviço de ${spokenCategoryLabel(context.category)}.`,
    ),
    quote: null,
    escalate: false,
    done: false,
    optOut: false,
    referrals: [],
  };
}
