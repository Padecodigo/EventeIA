import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMetaWebhookJob } from "@/lib/jobs/meta-webhook";
import type { MetaInboundMessage } from "@/lib/meta/webhook";

/**
 * Debounce da resposta: uma rajada de mensagens na mesma conversa deve gerar UM
 * único job de resposta. O jobId `reply_<conversa>` faz o BullMQ ignorar o `add`
 * de um job com o mesmo id ainda em espera/delay.
 */

const state = vi.hoisted(() => ({
  conversations: new Map<string, { id: string; status: string }>(),
  seq: 0,
  replyJobs: new Map<string, { data: Record<string, unknown>; opts?: { jobId?: string; delayMs?: number } }>(),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    META_ACCESS_TOKEN: "access-token",
    META_INSTAGRAM_BUSINESS_ID: "ig-biz-1",
    META_PAGE_ID: "page-1",
    META_PROSPECT_KEYWORD: "cotação",
  }),
}));

vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: { prospectReply: "prospect-reply" },
  enqueue: async (
    queueName: string,
    _name: string,
    data: Record<string, unknown>,
    opts?: { jobId?: string; delayMs?: number },
  ) => {
    if (queueName === "prospect-reply" && opts?.jobId !== undefined) {
      // BullMQ: job com o mesmo id ainda waiting/delayed é ignorado no add.
      if (!state.replyJobs.has(opts.jobId)) {
        state.replyJobs.set(opts.jobId, { data, opts });
      }
    }
    return true;
  },
}));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeDb, fakeClient } = await import("./helpers/fake-supabase");
  const db = createFakeDb({});
  return { getSupabaseAdmin: () => fakeClient(db) };
});

vi.mock("@/lib/meta/resolve", () => ({
  resolveInstagramSupplier: async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" }),
  resolveInstagramSupplierByHandle: async () => null,
  instagramProfileUrl: (handle: string) => `https://www.instagram.com/${handle}`,
}));

vi.mock("@/lib/prospecting/supabase-store", () => ({
  createSupabaseProspectStore: () => {
    const key = (channel: string, externalUserId: string) => `${channel}:${externalUserId}`;
    return {
      async findConversation(channel: string, externalUserId: string) {
        return state.conversations.get(key(channel, externalUserId)) ?? null;
      },
      async createConversation(input: { supplierId: string | null; channel: string; externalUserId: string }) {
        const existing = state.conversations.get(key(input.channel, input.externalUserId));
        if (existing !== undefined) return existing;
        const conversation = { id: `c${String(++state.seq)}`, status: "open" };
        state.conversations.set(key(input.channel, input.externalUserId), conversation);
        return conversation;
      },
      async insertMessage(_input: { conversationId: string; direction: string; body: string; externalId: string | null }) {
        return true;
      },
      async updateConversation(id: string, patch: { status?: string; lastInboundAt?: Date }) {
        for (const [k, conversation] of state.conversations) {
          if (conversation.id === id && patch.status !== undefined) {
            state.conversations.set(k, { ...conversation, status: patch.status });
          }
        }
      },
    };
  },
}));

function igDm(text: string, mid: string): MetaInboundMessage {
  return {
    source: "instagram",
    eventId: mid,
    senderId: "111",
    recipientId: "1784",
    text,
  };
}

describe("handleMetaWebhookJob — debounce por conversa", () => {
  beforeEach(() => {
    state.conversations.clear();
    state.seq = 0;
    state.replyJobs.clear();
  });

  it("rajada de 3 mensagens na mesma conversa gera um único job de resposta", async () => {
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: igDm("olá", "mid-1") });
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w2", event: igDm("preciso de buffet", "mid-2") });
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w3", event: igDm("para 100 pessoas", "mid-3") });

    expect(state.replyJobs.size).toBe(1);
    const [job] = [...state.replyJobs.values()];
    expect(job?.opts?.jobId).toBe("reply_c1");
    expect(job?.opts?.delayMs).toBe(8000);
    expect(job?.data).toMatchObject({ conversationId: "c1", supplierId: "s1" });
  });
});
