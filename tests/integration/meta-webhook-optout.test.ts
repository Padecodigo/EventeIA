import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMetaWebhookJob } from "@/lib/jobs/meta-webhook";
import type { MetaInboundMessage } from "@/lib/meta/webhook";

/**
 * Regressão LGPD: o processamento do webhook do Meta NUNCA enfileira a resposta
 * do agente quando a mensagem é um pedido de parada ("PARAR") ou quando a
 * conversa já está `opted_out`. O opt-out determinístico vive em `handleInbound`;
 * aqui validamos que o job `handleMetaWebhookJob` respeita a guarda
 * `shouldAgentRespond` (a rota apenas persiste e enfileira).
 */

const state = vi.hoisted(() => ({
  markOptOutCalls: [] as { conversationId: string; supplierId: string | null }[],
  conversations: new Map<string, { id: string; status: string }>(),
  enqueueCalls: [] as {
    queueName: string;
    name: string;
    data: Record<string, unknown>;
    opts?: { jobId?: string; delayMs?: number; removeOnComplete?: boolean | number; removeOnFail?: boolean | number };
  }[],
  seq: 0,
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    META_APP_SECRET: "app-secret-teste",
    META_VERIFY_TOKEN: "verify-token",
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
    name: string,
    data: Record<string, unknown>,
    opts?: { jobId?: string; delayMs?: number; removeOnComplete?: boolean | number; removeOnFail?: boolean | number },
  ) => {
    state.enqueueCalls.push({ queueName, name, data, opts });
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

vi.mock("@/lib/prospecting/supabase-respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prospecting/supabase-respond")>();
  return {
    ...actual,
    markSupplierOptOut: async (
      _db: unknown,
      conversationId: string,
      supplierId: string | null,
    ) => {
      state.markOptOutCalls.push({ conversationId, supplierId });
    },
  };
});

function igDm(text: string): MetaInboundMessage {
  return {
    source: "instagram",
    eventId: `mid-${text}`,
    senderId: "111",
    recipientId: "1784",
    text,
  };
}

const replyJobs = () => state.enqueueCalls.filter((c) => c.queueName === "prospect-reply");

describe("handleMetaWebhookJob — opt-out bloqueia a resposta do agente", () => {
  beforeEach(() => {
    state.markOptOutCalls = [];
    state.conversations.clear();
    state.enqueueCalls = [];
    state.seq = 0;
  });

  it("DM 'PARAR' ⇒ NÃO enfileira resposta e marca opt-out com o supplier id", async () => {
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "wh1", event: igDm("PARAR") });
    expect(replyJobs()).toHaveLength(0);
    expect(state.markOptOutCalls).toEqual([{ conversationId: "c1", supplierId: "s1" }]);
  });

  it("conversa já opted_out com texto normal ⇒ NÃO enfileira resposta", async () => {
    state.conversations.set("instagram:111", { id: "c1", status: "opted_out" });
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "wh1", event: igDm("olá, tudo bem?") });
    expect(replyJobs()).toHaveLength(0);
  });

  it("texto normal em conversa nova ⇒ enfileira resposta (debounce) e opt-out NÃO é marcado", async () => {
    await handleMetaWebhookJob({
      kind: "message",
      webhookEventId: "wh1",
      event: igDm("tem buffet para 100 pessoas?"),
    });
    const jobs = replyJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.opts).toMatchObject({
      jobId: "reply_c1",
      delayMs: 8000,
      removeOnComplete: true,
      removeOnFail: true,
    });
    expect(jobs[0]?.data).toMatchObject({ conversationId: "c1", channel: "instagram" });
    expect(state.markOptOutCalls).toEqual([]);
  });
});
