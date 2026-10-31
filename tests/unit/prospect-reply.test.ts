import { describe, expect, it, vi } from "vitest";

import {
  handleProspectReplyJob,
  type ProspectReplyJobData,
  type ProspectReplyJobDeps,
  type ProspectReplyRedis,
} from "@/lib/jobs/prospect-reply";
import type { AgentContext } from "@/lib/prospecting/agent";
import type { ConversationStatus } from "@/lib/prospecting/inbound";
import type { RespondDb } from "@/lib/prospecting/supabase-respond";

function fakeRedis(overrides: Partial<ProspectReplyRedis> = {}): ProspectReplyRedis & {
  keys: Map<string, number>;
} {
  const keys = new Map<string, number>();
  return {
    keys,
    async incr(key) {
      const next = (keys.get(key) ?? 0) + 1;
      keys.set(key, next);
      return next;
    },
    async expire() {
      return 1;
    },
    async set(key, value, ttlMs) {
      void value;
      void ttlMs;
      return keys.has(key) ? null : (keys.set(key, 1), "OK");
    },
    async del(key) {
      keys.delete(key);
      return 1;
    },
    ...overrides,
  };
}

interface FakeState {
  replies: { conversationId: string; context: AgentContext; supplierId: string | null }[];
  escalations: { conversationId: string; reason: string }[];
}

function makeDeps(overrides: Partial<ProspectReplyJobDeps> = {}, state: FakeState = { replies: [], escalations: [] }) {
  const redis = fakeRedis();
  const deps: ProspectReplyJobDeps = {
    env: { accessToken: "tok", igBusinessId: "ig-1", pageId: "pg-1" },
    redis: () => redis,
    respondDb: {} as RespondDb,
    loadConversationStatus: async () => "awaiting_human",
    loadHistory: async () => [{ role: "user" as const, content: "olá" }],
    respond: async (input) => {
      state.replies.push({
        conversationId: input.conversationId,
        context: input.context,
        supplierId: input.supplierId,
      });
      return { action: "replied" as const, sent: true };
    },
    getClient: () => ({ mode: "mock" as const, complete: async () => "{}" }),
    buildPorts: () => ({
      sendReply: async () => true,
      saveQuote: async () => undefined,
      markOptOut: async () => undefined,
      escalate: async (conversationId, reason) => {
        state.escalations.push({ conversationId, reason });
      },
    }),
    ...overrides,
  };
  return { deps, redis, state };
}

const data: ProspectReplyJobData = {
  conversationId: "c1",
  channel: "instagram",
  recipientId: "111",
  supplierId: "s1",
  category: "buffet",
};

describe("handleProspectReplyJob", () => {
  it("responde quando a conversa está aberta", async () => {
    const { deps, state } = makeDeps();
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(1);
    expect(state.replies[0]?.conversationId).toBe("c1");
  });

  it("ignora conversa opted_out", async () => {
    const { deps, state } = makeDeps({ loadConversationStatus: async () => "opted_out" });
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(0);
  });

  it("ignora conversa inexistente", async () => {
    const { deps, state } = makeDeps({ loadConversationStatus: async () => null });
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(0);
  });

  it("rate-limit: acima do teto horário escala em vez de responder", async () => {
    const { deps, state, redis } = makeDeps();
    redis.keys.set(`eventeia:prospect-reply:cap:c1`, 7);
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(0);
    expect(state.escalations).toEqual([
      { conversationId: "c1", reason: "limite de respostas por hora excedido" },
    ]);
  });

  it("lock não adquirido: não responde (concorrência)", async () => {
    const { deps, state } = makeDeps();
    deps.redis = () => ({
      ...fakeRedis(),
      set: async () => null,
    });
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(0);
  });

  it("respeita maxRepliesPerHour customizado", async () => {
    const { deps, state, redis } = makeDeps({ maxRepliesPerHour: 1 });
    redis.keys.set(`eventeia:prospect-reply:cap:c1`, 1); // incr → 2 > 1
    await handleProspectReplyJob(data, deps);
    expect(state.replies).toHaveLength(0);
    expect(state.escalations).toHaveLength(1);
  });
});
