import { describe, expect, it } from "vitest";

import {
  handleInbound,
  type ConversationStatus,
  type ProspectConversation,
  type ProspectStore,
} from "@/lib/prospecting/inbound";

/** Fake em memória da porta de persistência. */
function fakeStore(): ProspectStore & {
  conversations: Map<string, ProspectConversation>;
  messages: { conversationId: string; externalId: string | null }[];
  updates: { id: string; status?: ConversationStatus }[];
} {
  const conversations = new Map<string, ProspectConversation>();
  const messages: { conversationId: string; externalId: string | null }[] = [];
  const updates: { id: string; status?: ConversationStatus }[] = [];
  let seq = 0;

  return {
    conversations,
    messages,
    updates,
    async findConversation(channel, externalUserId) {
      return conversations.get(`${channel}:${externalUserId}`) ?? null;
    },
    async createConversation(input) {
      const conversation: ProspectConversation = { id: `c${++seq}`, status: "open" };
      conversations.set(`${input.channel}:${input.externalUserId}`, conversation);
      return conversation;
    },
    async insertMessage(input) {
      const duplicate = messages.some(
        (m) => m.conversationId === input.conversationId && m.externalId !== null && m.externalId === input.externalId,
      );
      if (duplicate) return false;
      messages.push({ conversationId: input.conversationId, externalId: input.externalId });
      return true;
    },
    async updateConversation(id, patch) {
      updates.push({ id, status: patch.status });
      for (const [key, conversation] of conversations) {
        if (conversation.id === id && patch.status !== undefined) {
          conversations.set(key, { ...conversation, status: patch.status });
        }
      }
    },
  };
}

const NOW = new Date("2026-10-27T12:00:00Z");
const base = { supplierId: "s1", channel: "instagram" as const };

describe("handleInbound", () => {
  it("cria a conversa e grava a mensagem na primeira DM", async () => {
    const store = fakeStore();
    const result = await handleInbound(
      store,
      { kind: "message", messageId: "m1", senderId: "u1", text: "olá", ...base },
      { keyword: "cotação", now: NOW },
    );
    expect(result.recorded).toBe(true);
    expect(result.conversation.status).toBe("awaiting_human");
    expect(store.messages).toHaveLength(1);
  });

  it("é idempotente: replay do mesmo mid não grava de novo", async () => {
    const store = fakeStore();
    const event = { kind: "message" as const, messageId: "m1", senderId: "u1", text: "olá", ...base };
    await handleInbound(store, event, { keyword: "cotação", now: NOW });
    const replay = await handleInbound(store, event, { keyword: "cotação", now: NOW });
    expect(replay.recorded).toBe(false);
    expect(store.messages).toHaveLength(1);
  });

  it("comentário com palavra-chave gera private reply e grava", async () => {
    const store = fakeStore();
    const result = await handleInbound(
      store,
      { kind: "comment", commentId: "c1", senderId: "u1", text: "quero cotação", ...base },
      { keyword: "cotação", now: NOW },
    );
    expect(result.action).toEqual({ action: "private_reply", commentId: "c1" });
    expect(result.recorded).toBe(true);
  });

  it("pedido de parada marca opted_out", async () => {
    const store = fakeStore();
    const result = await handleInbound(
      store,
      { kind: "message", messageId: "m9", senderId: "u2", text: "parar", ...base },
      { keyword: "cotação", now: NOW },
    );
    expect(result.conversation.status).toBe("opted_out");
  });

  it("conversa já opted_out não volta a awaiting_human", async () => {
    const store = fakeStore();
    await handleInbound(store, { kind: "message", messageId: "m1", senderId: "u3", text: "parar", ...base }, { keyword: "x", now: NOW });
    const after = await handleInbound(store, { kind: "message", messageId: "m2", senderId: "u3", text: "voltei", ...base }, { keyword: "x", now: NOW });
    expect(after.conversation.status).toBe("opted_out");
  });
});
