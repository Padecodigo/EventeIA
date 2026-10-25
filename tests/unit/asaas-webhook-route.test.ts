import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração do webhook Asaas com Supabase/fila mockados:
 * token inválido, replay duplicado (2ª chamada 200 sem reprocessar) e fallback.
 */

const state = vi.hoisted(() => ({
  seen: new Set<string>(),
  rpcCalls: 0,
  rpcError: null as null | { code: string },
  enqueued: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: (row: { external_event_id: string }) => ({
        select: () => ({
          maybeSingle: () => {
            if (state.seen.has(row.external_event_id)) {
              return Promise.resolve({ data: null, error: null });
            }
            state.seen.add(row.external_event_id);
            return Promise.resolve({ data: { id: `wh-${String(state.seen.size)}` }, error: null });
          },
        }),
      }),
    }),
    rpc: () => {
      state.rpcCalls += 1;
      return Promise.resolve(
        state.rpcError === null ? { data: "processed", error: null } : { data: null, error: state.rpcError },
      );
    },
  }),
}));

vi.mock("@/lib/discovery/runtime", () => ({ startDiscovery: () => Promise.resolve(true) }));

vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: { asaasWebhooks: "asaas-webhooks" },
  enqueue: () => {
    state.enqueued += 1;
    return Promise.resolve(true);
  },
}));

const TOKEN = "token-de-teste-com-32-caracteres!";

function call(body: unknown, token: string | null = TOKEN): Request {
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token !== null ? { "asaas-access-token": token } : {}) },
    body: JSON.stringify(body),
  });
}

const payload = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", status: "RECEIVED" } };

describe("POST /api/webhooks/asaas", () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    state.seen.clear();
    state.rpcCalls = 0;
    state.rpcError = null;
    state.enqueued = 0;
  });

  it("token inválido ⇒ 401 sem tocar o banco", async () => {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    expect((await POST(call(payload, "errado"))).status).toBe(401);
    expect((await POST(call(payload, null))).status).toBe(401);
    expect(state.rpcCalls).toBe(0);
  });

  it("idempotente: 2ª chamada responde 200 e NÃO reprocessa", async () => {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const first = await POST(call(payload));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, result: "processed" });

    const second = await POST(call(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, duplicated: true });
    expect(state.rpcCalls).toBe(1);
  });

  it("falha do SQL ⇒ fallback para a fila (evento já persistido)", async () => {
    state.rpcError = { code: "57014" };
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const response = await POST(call(payload));
    expect(response.status).toBe(200);
    expect(state.enqueued).toBe(1);
  });

  it("cartão: PAYMENT_CONFIRMED (CREDIT_CARD) é processado; RECEIVED posterior é outro evento idempotente", async () => {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const confirmed = {
      id: "evt_card_1",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_card", status: "CONFIRMED", billingType: "CREDIT_CARD", netValue: 93.61 },
    };
    const res = await POST(call(confirmed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "processed" });
    expect(state.rpcCalls).toBe(1);

    const received = { ...confirmed, id: "evt_card_2", event: "PAYMENT_RECEIVED" };
    expect((await POST(call(received))).status).toBe(200);
    expect((await POST(call(confirmed))).status).toBe(200);
    expect(state.rpcCalls).toBe(2);
  });

  it("chargeback em disputa é aceito (200) e registrado — o SQL marca como não mapeado", async () => {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const res = await POST(
      call({ id: "evt_cb", event: "PAYMENT_CHARGEBACK_DISPUTE", payment: { id: "pay_card", status: "CHARGEBACK_DISPUTE" } }),
    );
    expect(res.status).toBe(200);
  });

  it("payload inválido ⇒ 400", async () => {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    expect((await POST(call({ foo: 1 }))).status).toBe(400);
  });
});

describe("POST /api/dev/simulate-payment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("404 fora de development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/dev/simulate-payment/route");
    const response = await POST(
      new Request("http://localhost/api/dev/simulate-payment", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(404);
  });

  it("em development envia PAYMENT_RECEIVED ao webhook com o token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    const fetchMock = vi.fn((_url: URL, _init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/dev/simulate-payment/route");
    const response = await POST(
      new Request("http://localhost:3000/api/dev/simulate-payment", {
        method: "POST",
        body: JSON.stringify({ asaasPaymentId: "pay_123", webhookEventId: "evt_fixo" }),
      }),
    );
    expect(response.status).toBe(200);
    const call0 = fetchMock.mock.calls[0];
    if (call0 === undefined) throw new Error("fetch não chamado");
    const [url, init] = call0;
    expect(String(url)).toBe("http://localhost:3000/api/webhooks/asaas");
    expect((init.headers as Record<string, string>)["asaas-access-token"]).toBe(TOKEN);
    expect(JSON.parse(init.body as string)).toMatchObject({ id: "evt_fixo", event: "PAYMENT_RECEIVED", payment: { id: "pay_123" } });
  });
});
