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
    // Terça 03/11/2026 10:00 BRT — dentro do horário comercial.
    now: () => new Date("2026-11-03T13:00:00Z"),
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

describe("regressão: horário comercial no prospect-reply", () => {
  it("domingo: lança OutsideBusinessHoursError e não responde nem lê a conversa", async () => {
    const { OutsideBusinessHoursError } = await import("@/lib/outreach/business-defer");
    let loaded = false;
    const { deps, state } = makeDeps({
      now: () => new Date("2026-11-01T14:00:00Z"),
      loadConversationStatus: async () => {
        loaded = true;
        return "awaiting_human";
      },
    });
    await expect(handleProspectReplyJob(data, deps)).rejects.toBeInstanceOf(OutsideBusinessHoursError);
    expect(state.replies).toHaveLength(0);
    expect(loaded).toBe(false);
  });
});

describe("handleProspectReplyJob + loop de cobertura (0078)", () => {
  it("passa as portas envolvidas pelo loop quando a cobertura está ligada", async () => {
    const load = vi.fn(async () => null);
    let portsSeen: unknown = null;
    const { deps } = makeDeps({
      coverage: () => ({ load, latestQuoteId: async () => null, save: async () => undefined, classify: async () => "{}", now: () => new Date() }),
      respond: async (input) => {
        portsSeen = input.ports;
        return { action: "replied" as const, sent: true };
      },
    });
    await handleProspectReplyJob(data, deps);
    expect(load).toHaveBeenCalledWith("c1");
    expect(portsSeen).not.toBeNull();
  });

  it("domingo: adia antes de tocar na cobertura (horário comercial)", async () => {
    const load = vi.fn(async () => null);
    const { deps } = makeDeps({
      now: () => new Date("2026-11-01T13:00:00Z"),
      coverage: () => ({ load, latestQuoteId: async () => null, save: async () => undefined, classify: async () => "{}", now: () => new Date() }),
    });
    await expect(handleProspectReplyJob(data, deps)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
