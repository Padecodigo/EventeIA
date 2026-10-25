import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

/**
 * Checkout do tíquete com Asaas mockado (fetch): Pix e cartão (crédito
 * na Fatura hospedada). Garante que nenhum dado de cartão trafega por nós.
 */
let db: FakeDb;

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user-1", email: "a@b.com" }),
  requireAdmin: async () => ({ id: "admin-1" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => fakeClient(db) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeClient(db),
}));
vi.mock("@/lib/welcome/server", () => ({
  bindWelcomeOfferToUser: async () => undefined,
  reserveWelcomeOffer: async () => null,
}));
vi.mock("@/lib/lucky/server", () => ({ reserveLuckyCoupon: async () => null }));
vi.mock("@/lib/feeds", () => ({ emitFeed: async () => undefined }));
vi.mock("@/lib/queue", () => ({ enqueue: async () => true, QUEUE_NAMES: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const calls: { url: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-falsa-para-testes-0123456789");
  vi.stubEnv("ASAAS_API_KEY", "chave-falsa-de-teste");
  vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
  vi.stubEnv("B2C_TICKET_PRICE_CENTS", "9700");
  calls.length = 0;
  db = createFakeDb({
    events: [{ id: "11111111-1111-4111-8111-111111111111", title: "Casamento", status: "draft" }],
    event_tickets: [],
    profiles: [
      { id: "user-1", display_name: "Ana", document_number: null, asaas_customer_id: "cus_1" },
    ],
    payments: [],
    coupons: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, body });
      if (url.endsWith("/pixQrCode")) {
        return new Response(JSON.stringify({ encodedImage: "img", payload: "000201PIX" }));
      }
      return new Response(
        JSON.stringify({
          id: body?.billingType === "PIX" ? "pay_pix" : "pay_card",
          status: "PENDING",
          invoiceUrl: "https://www.asaas.com/i/abc",
        }),
      );
    }),
  );
});

function form(method?: string): FormData {
  const f = new FormData();
  f.set("eventId", "11111111-1111-4111-8111-111111111111");
  f.set("cpf", "529.982.247-25");
  if (method !== undefined) f.set("method", method);
  return f;
}

describe("buyTicketAction — formas de pagamento", () => {
  it("cartão ⇒ cobrança CREDIT_CARD sem dados de cartão e redireciona à Fatura", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("card"));

    expect(state.error).toBeUndefined();
    expect(state.card).toEqual({ invoiceUrl: "https://www.asaas.com/i/abc" });
    expect(state.pix).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ billingType: "CREDIT_CARD", value: 97 });
    expect(calls[0]?.body).not.toHaveProperty("creditCard");
    expect(db.tables.payments?.[0]).toMatchObject({
      asaas_payment_id: "pay_card",
      billing_type: "CREDIT_CARD",
      status: "pending",
      amount_cents: 9700,
    });
    expect(db.tables.event_tickets?.[0]).toMatchObject({ status: "pending" });
  });

  it("pix ⇒ comportamento anterior (QR copia-e-cola)", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("pix"));
    expect(state.pix?.payload).toBe("000201PIX");
    expect(calls[0]?.body).toMatchObject({ billingType: "PIX" });
    expect(db.tables.payments?.[0]).toMatchObject({ billing_type: "PIX" });
  });

  it("regressão: sem método informado continua Pix (forms antigos em cache)", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form());
    expect(state.pix).toBeDefined();
  });

  it("método desconhecido (ex.: boleto) é recusado sem chamar o Asaas", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("boleto"));
    expect(state.error).toBeDefined();
    expect(calls).toHaveLength(0);
  });
});
