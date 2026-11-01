import { moderateContactInfo } from "./moderation";
import { canSend, type SendBlockReason, type SupplierConversationStatus } from "./send-guard";

/**
 * Chat mediado do evento (Instagram DM + Messenger).
 *
 * O usuário conversa pelo app, mas a mensagem só é relayada ao fornecedor
 * DENTRO da janela da Meta (send-guard). Tudo o que entra/sai passa pela
 * moderação — o contato do fornecedor nunca aparece para o usuário.
 *
 * O núcleo é testável: banco e função de envio entram por injeção.
 */

export type ChatChannel = "instagram" | "messenger";
export type ChatAuthor = "user" | "agent" | "system";

export interface ChatConversationRow {
  id: string;
  event_id: string | null;
  supplier_id: string | null;
  channel: ChatChannel;
  external_user_id: string;
  status: SupplierConversationStatus;
  window_expires_at: string | null;
}

export interface ChatDb {
  from(table: "supplier_conversations"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: ChatConversationRow | null; error: { code?: string } | null }>;
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { code?: string } | null }>;
    };
  };
  from(table: "supplier_conversation_messages"): {
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  };
}

export interface ChatSendInput {
  eventId: string;
  conversationId: string;
  body: string;
  author: ChatAuthor;
}

export type ChatSendFn = (input: {
  channel: ChatChannel;
  recipientId: string;
  text: string;
}) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>;

export interface ChatSendDeps {
  now: Date;
  send: ChatSendFn;
}

export type ChatSendResult =
  | { ok: true; messageId: string | null; masked: boolean }
  | { ok: false; error: string; closed: boolean };

function blockMessage(reason: SendBlockReason): { error: string; closed: boolean } {
  switch (reason) {
    case "opted_out":
      return {
        error: "O fornecedor pediu para não receber mensagens. Você pode seguir com outros fornecedores.",
        closed: true,
      };
    case "canal_fechado":
    case "window_closed":
      return {
        error: "A janela de conversa com este fornecedor foi encerrada. Você pode seguir com outros fornecedores.",
        closed: true,
      };
    case "outside_business_hours":
      return {
        error: "O envio aos fornecedores acontece em dias úteis, das 9h às 18h (horário de Brasília).",
        closed: false,
      };
  }
}

/**
 * Relaya uma mensagem do usuário (ou de um agente) ao fornecedor.
 * - modera o texto antes de enviar/gravar;
 * - respeita opt-out e janela (send-guard);
 * - mensagem digitada pelo próprio usuário (`author: "user"`) pode sair fora do
 *   horário comercial dentro de uma janela aberta (resposta humana direta);
 *   agentes/automação continuam restritos ao horário comercial;
 * - quando a janela fechou, marca a conversa como `canal_fechado`.
 */
export async function sendChatMessage(
  db: ChatDb,
  input: ChatSendInput,
  deps: ChatSendDeps,
): Promise<ChatSendResult> {
  const { data: conversation } = await db
    .from("supplier_conversations")
    .select("id,event_id,supplier_id,channel,external_user_id,status,window_expires_at")
    .eq("id", input.conversationId)
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (conversation === null) {
    return { ok: false, error: "Conversa não encontrada.", closed: false };
  }

  const moderation = moderateContactInfo(input.body);
  if (moderation.text.length === 0) {
    return { ok: false, error: "Escreva uma mensagem.", closed: false };
  }

  const decision = canSend(
    { status: conversation.status, windowExpiresAt: conversation.window_expires_at },
    deps.now,
    { allowOutsideBusinessHours: input.author === "user" },
  );

  if (!decision.ok) {
    const blocked = blockMessage(decision.reason);
    if (blocked.closed && conversation.status !== "opted_out") {
      await db
        .from("supplier_conversations")
        .update({ status: "canal_fechado", updated_at: deps.now.toISOString() })
        .eq("id", conversation.id);
    }
    return { ok: false, ...blocked };
  }

  const sent = await deps.send({
    channel: conversation.channel,
    recipientId: conversation.external_user_id,
    text: moderation.text,
  });
  if (!sent.ok) {
    return { ok: false, error: "Não foi possível enviar a mensagem agora. Tente novamente.", closed: false };
  }

  const { error } = await db.from("supplier_conversation_messages").insert({
    conversation_id: conversation.id,
    direction: "out",
    body: moderation.text,
    moderated: moderation.masked,
    external_id: sent.messageId,
    author: input.author,
  });
  // 23505: o eco da Meta já espelhou este mid — a mensagem saiu e está no chat.
  if (error !== null && error.code !== "23505") {
    return { ok: false, error: "Não foi possível registrar a mensagem. Tente novamente.", closed: false };
  }

  await db
    .from("supplier_conversations")
    .update({ updated_at: deps.now.toISOString() })
    .eq("id", conversation.id);

  return { ok: true, messageId: sent.messageId, masked: moderation.masked };
}

export type ChatMessageAuthor = "supplier" | ChatAuthor;

export interface ChatMessageView {
  id: string;
  direction: "in" | "out";
  author: ChatMessageAuthor;
  body: string;
  moderated: boolean;
  createdAt: string;
}

export interface ChatConversationView {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierCategory: string | null;
  channel: ChatChannel;
  status: SupplierConversationStatus;
  windowExpiresAt: string | null;
  lastInboundAt: string | null;
  canReply: boolean;
  blockReason: SendBlockReason | null;
  messages: ChatMessageView[];
}
