import "server-only";

import { canSend } from "@/lib/outreach/send-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type {
  ChatChannel,
  ChatConversationView,
  ChatMessageAuthor,
  ChatMessageView,
} from "./chat";
import type { SupplierConversationStatus } from "./send-guard";

interface ConversationRow {
  id: string;
  supplier_id: string | null;
  channel: ChatChannel;
  status: SupplierConversationStatus;
  window_expires_at: string | null;
  last_inbound_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string;
  author: "user" | "agent" | "system" | null;
  moderated: boolean;
  created_at: string;
}

const MESSAGE_LIMIT = 500;

function authorOf(row: MessageRow): ChatMessageAuthor {
  if (row.direction === "in") return "supplier";
  return row.author ?? "user";
}

/**
 * Carrega as conversas mediadas de um evento com fornecedor (nome/categoria) e
 * mensagens já moderadas. Usa o client admin porque `suppliers` é catálogo global;
 * a chamada só é feita depois de a RLS do evento confirmar a posse.
 */
export async function listEventChatConversations(
  eventId: string,
  now: Date = new Date(),
): Promise<ChatConversationView[]> {
  const admin = getSupabaseAdmin();

  const { data: conversationRows } = await admin
    .from("supplier_conversations")
    .select("id,supplier_id,channel,status,window_expires_at,last_inbound_at")
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false });
  const conversations = (conversationRows ?? []) as ConversationRow[];
  if (conversations.length === 0) return [];

  const supplierIds = [
    ...new Set(
      conversations
        .map((conversation) => conversation.supplier_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const { data: supplierRows } =
    supplierIds.length > 0
      ? await admin.from("suppliers").select("id,name,category").in("id", supplierIds)
      : { data: [] as { id: string; name: string; category: string }[] };
  const suppliers = new Map((supplierRows ?? []).map((supplier) => [supplier.id, supplier]));

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: messageRows } = await admin
    .from("supplier_conversation_messages")
    .select("id,conversation_id,direction,body,author,moderated,created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_LIMIT);

  const messagesByConversation = new Map<string, ChatMessageView[]>();
  for (const row of ((messageRows ?? []) as MessageRow[]).slice().reverse()) {
    const list = messagesByConversation.get(row.conversation_id) ?? [];
    list.push({
      id: row.id,
      direction: row.direction,
      author: authorOf(row),
      body: row.body,
      moderated: row.moderated,
      createdAt: row.created_at,
    });
    messagesByConversation.set(row.conversation_id, list);
  }

  return conversations.map((conversation) => {
    const supplier = conversation.supplier_id !== null ? suppliers.get(conversation.supplier_id) : undefined;
    // No painel do evento a resposta é sempre digitada pelo usuário: dentro da
    // janela aberta ela pode sair fora do horário comercial (ver send-guard).
    const decision = canSend(
      { status: conversation.status, windowExpiresAt: conversation.window_expires_at },
      now,
      { allowOutsideBusinessHours: true },
    );
    return {
      id: conversation.id,
      supplierId: conversation.supplier_id,
      supplierName: supplier?.name ?? "Fornecedor",
      supplierCategory: supplier?.category ?? null,
      channel: conversation.channel,
      status: conversation.status,
      windowExpiresAt: conversation.window_expires_at,
      lastInboundAt: conversation.last_inbound_at,
      canReply: decision.ok,
      blockReason: decision.ok ? null : decision.reason,
      messages: messagesByConversation.get(conversation.id) ?? [],
    };
  });
}
