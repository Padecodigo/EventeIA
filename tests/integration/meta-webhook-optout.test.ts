import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient } from "./helpers/fake-supabase";

/**
 * Regressão LGPD: o webhook do Meta NUNCA chama o agente (respondToInbound)
 * quando a mensagem é um pedido de parada ("PARAR") ou quando a conversa já
 * está `opted_out`. O opt-out determinístico vive em `handleInbound`; aqui
 * validamos que a rota respeita a guarda `shouldAgentRespond`.
 */

const SECRET = "app-secret-teste";

const state = vi.hoisted(() => ({
  respondCalls: 0,
  markOptOutCalls: [] as { conversationId: string; supplierId: string | null }[],
  conversations: new Map<string, { id: string; status: string }>(),
  seq: 0,
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    META_APP_SECRET: SECRET,
    META_VERIFY_TOKEN: "verify-token",
    META_ACCESS_TOKEN: "access-token",
    META_INSTAGRAM_BUSINESS_ID: "ig-biz-1",
    META_PAGE_ID: "page-1",
    META_PROSPECT_KEYWORD: "cotação",
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
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

vi.mock("@/lib/deepseek/client", () => ({
  getDeepSeekClient: () => ({
    mode: "mock",
    complete: async () => JSON.stringify({ reply: "ok", opt_out: false }),
  }),
}));

vi.mock("@/lib/prospecting/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prospecting/respond")>();
  return {
    ...actual,
    respondToInbound: async () => {
      state.respondCalls += 1;
      return { action: "replied", sent: true };
    },
  };
});

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

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body, "utf8").digest("hex")}`;
}

function call(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/meta/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": sign(raw) },
    body: raw,
  });
}

function igDm(text: string): unknown {
  return {
    object: "instagram",
    entry: [
      {
        id: "1784",
        changes: [
          {
            field: "messages",
            value: {
              sender: { id: "111" },
              recipient: { id: "1784" },
              message: { mid: `mid-${text}`, text },
            },
          },
        ],
      },
    ],
  };
}

describe("POST /api/meta/webhook — opt-out bloqueia a resposta do agente", () => {
  beforeEach(() => {
    state.respondCalls = 0;
    state.markOptOutCalls = [];
    state.conversations.clear();
    state.seq = 0;
  });

  it("DM 'PARAR' ⇒ respondToInbound NÃO é chamado e marca opt-out com o supplier id", async () => {
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("PARAR")));
    expect(res.status).toBe(200);
    expect(state.respondCalls).toBe(0);
    expect(state.markOptOutCalls).toEqual([{ conversationId: "c1", supplierId: "s1" }]);
  });

  it("conversa já opted_out com texto normal ⇒ respondToInbound NÃO é chamado", async () => {
    state.conversations.set("instagram:111", { id: "c1", status: "opted_out" });
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("olá, tudo bem?")));
    expect(res.status).toBe(200);
    expect(state.respondCalls).toBe(0);
  });

  it("texto normal em conversa nova ⇒ respondToInbound É chamado e opt-out NÃO é marcado", async () => {
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("tem buffet para 100 pessoas?")));
    expect(res.status).toBe(200);
    expect(state.respondCalls).toBe(1);
    expect(state.markOptOutCalls).toEqual([]);
  });
});
