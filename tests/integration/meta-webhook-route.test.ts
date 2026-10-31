import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração da rota `/api/meta/webhook` com Supabase/fila mockados:
 * persiste primeiro, enfileira por evento (jobId por external_event_id),
 * ignora duplicados já processados e devolve 500 sem enfileirar quando a
 * persistência ou a fila falham. A rota NUNCA chama DeepSeek, resolve ou responde.
 */

const SECRET = "app-secret-teste";

const state = vi.hoisted(() => ({
  rows: new Map<string, { id: string; status: string }>(),
  persistError: null as null | { code: string },
  enqueued: [] as { name: string; jobId: string; data: Record<string, unknown> }[],
  addError: null as null | Error,
  deepseekCalls: 0,
  resolveCalls: 0,
  respondCalls: 0,
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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: (row: { external_event_id: string; status: string }, _opts: unknown) => ({
        select: () => ({
          maybeSingle: async () => {
            if (state.persistError !== null) return { data: null, error: state.persistError };
            const existing = state.rows.get(row.external_event_id);
            if (existing !== undefined) return { data: null, error: null };
            const newRow = { id: `wh-${row.external_event_id}`, status: row.status };
            state.rows.set(row.external_event_id, newRow);
            return { data: newRow, error: null };
          },
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: (_column: string, externalEventId: string) => ({
            maybeSingle: async () => ({
              data: state.rows.get(externalEventId) ?? null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: { metaWebhooks: "meta-webhooks" },
  getQueue: () => ({
    add: async (
      name: string,
      data: Record<string, unknown>,
      opts?: { jobId?: string },
    ) => {
      if (state.addError !== null) throw state.addError;
      state.enqueued.push({ name, jobId: opts?.jobId ?? "", data });
    },
  }),
}));

vi.mock("@/lib/deepseek/client", () => ({
  getDeepSeekClient: () => {
    state.deepseekCalls += 1;
    return { mode: "mock", complete: async () => "{}" };
  },
}));

vi.mock("@/lib/meta/resolve", () => ({
  resolveInstagramSupplier: async () => {
    state.resolveCalls += 1;
    return null;
  },
  resolveInstagramSupplierByHandle: async () => {
    state.resolveCalls += 1;
    return null;
  },
}));

vi.mock("@/lib/prospecting/respond", () => ({
  respondToInbound: async () => {
    state.respondCalls += 1;
    return { action: "replied", sent: true };
  },
  shouldAgentRespond: () => false,
}));

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

function igDm(text: string, mid = "mid-1"): unknown {
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
              message: { mid, text },
            },
          },
        ],
      },
    ],
  };
}

describe("POST /api/meta/webhook", () => {
  beforeEach(() => {
    state.rows.clear();
    state.persistError = null;
    state.enqueued = [];
    state.addError = null;
    state.deepseekCalls = 0;
    state.resolveCalls = 0;
    state.respondCalls = 0;
  });

  it("persiste primeiro e enfileira com jobId por evento", async () => {
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("tem buffet para 100?", "mid-1")));
    expect(res.status).toBe(200);

    expect(state.rows.get("mid-1")).toEqual({ id: "wh-mid-1", status: "received" });
    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0]?.jobId).toBe("meta_mid-1");
    expect(state.enqueued[0]?.data).toMatchObject({
      kind: "message",
      webhookEventId: "wh-mid-1",
    });
    expect((state.enqueued[0]?.data.event as Record<string, unknown>).eventId).toBe("mid-1");
  });

  it("duplicado já processado (status processed) não enfileira de novo", async () => {
    state.rows.set("mid-1", { id: "wh-mid-1", status: "processed" });
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("tem buffet para 100?", "mid-1")));
    expect(res.status).toBe(200);
    expect(state.enqueued).toHaveLength(0);
  });

  it("falha na persistência ⇒ 500 e nenhum job enfileirado", async () => {
    state.persistError = { code: "57014" };
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("olá", "mid-2")));
    expect(res.status).toBe(500);
    expect(state.enqueued).toHaveLength(0);
  });

  it("falha ao enfileirar ⇒ 500 (o evento já foi persistido)", async () => {
    state.addError = new Error("redis down");
    const { POST } = await import("@/app/api/meta/webhook/route");
    const res = await POST(call(igDm("olá", "mid-3")));
    expect(res.status).toBe(500);
    expect(state.rows.get("mid-3")).toEqual({ id: "wh-mid-3", status: "received" });
    expect(state.enqueued).toHaveLength(0);
  });

  it("nunca chama DeepSeek, resolve ou respond", async () => {
    const { POST } = await import("@/app/api/meta/webhook/route");
    await POST(call(igDm("tem buffet para 100?", "mid-4")));
    expect(state.deepseekCalls).toBe(0);
    expect(state.resolveCalls).toBe(0);
    expect(state.respondCalls).toBe(0);
  });
});
