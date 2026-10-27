import { routeInbound, type InboundEvent, type RoutedAction } from "./router";

/**
 * Tratamento de uma entrada (comentário ou DM) já resolvida para um fornecedor.
 *
 * Idempotência: o mesmo `externalId` (mid do Meta) não é gravado duas vezes;
 * um replay devolve `recorded: false` e não altera a conversa.
 */

export type ConversationStatus =
  | "open"
  | "awaiting_supplier"
  | "awaiting_human"
  | "quoted"
  | "closed"
  | "opted_out";

export type Channel = "instagram" | "messenger";

export interface ProspectConversation {
  id: string;
  status: ConversationStatus;
}

/** Porta de persistência: Supabase em produção, fake em memória nos testes. */
export interface ProspectStore {
  findConversation(channel: Channel, externalUserId: string): Promise<ProspectConversation | null>;
  createConversation(input: {
    supplierId: string;
    channel: Channel;
    externalUserId: string;
  }): Promise<ProspectConversation>;
  /** `false` quando o evento externo já existia (replay idempotente). */
  insertMessage(input: {
    conversationId: string;
    direction: "in" | "out";
    body: string;
    externalId: string | null;
  }): Promise<boolean>;
  updateConversation(
    id: string,
    patch: { status?: ConversationStatus; lastInboundAt?: Date },
  ): Promise<void>;
}

export type HandleInboundInput = InboundEvent & {
  supplierId: string;
  channel: Channel;
};

export interface HandleInboundResult {
  action: RoutedAction;
  conversation: ProspectConversation;
  recorded: boolean;
}

export async function handleInbound(
  store: ProspectStore,
  event: HandleInboundInput,
  options: { keyword: string; now: Date },
): Promise<HandleInboundResult> {
  const action = routeInbound(event, options);

  let conversation = await store.findConversation(event.channel, event.senderId);
  if (conversation === null) {
    conversation = await store.createConversation({
      supplierId: event.supplierId,
      channel: event.channel,
      externalUserId: event.senderId,
    });
  }

  const externalId = event.kind === "message" ? event.messageId : event.commentId;
  const recorded = await store.insertMessage({
    conversationId: conversation.id,
    direction: "in",
    body: event.text,
    externalId,
  });

  if (!recorded) {
    return { action, conversation, recorded };
  }

  const status: ConversationStatus =
    action.action === "opt_out"
      ? "opted_out"
      : conversation.status === "opted_out"
        ? "opted_out"
        : "awaiting_human";

  await store.updateConversation(conversation.id, { status, lastInboundAt: options.now });
  return { action, conversation: { ...conversation, status }, recorded };
}
