import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

/**
 * Cupons no checkout: cortesia (total 0, sem Asaas), reserva atômica e uso único por conta.
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
    coupons: [
      {
        id: "c-free",
        code: "EVENTEIA-FREE-277560",
        discount_type: "free",
        value: 9700,
        active: true,
        expires_at: null,
        max_redemptions: 1,
        redemptions: 0,
      },
      {
        id: "c-pct",
        code: "TUDO100",
        discount_type: "percent",
        value: 100,
        active: true,
        expires_at: null,
        max_redemptions: null,
        redemptions: 0,
      },
    ],
    coupon_redemptions: [],
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

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let reserveStatus = "ok";
let courtesyOutcome = "activated";

beforeEach(() => {
  rpcCalls.length = 0;
  reserveStatus = "ok";
  courtesyOutcome = "activated";
  db.rpc = async (fn, args) => {
    // Consulta da oferta pessoal (0036) não é efeito: sem oferta neste arquivo.
    if (fn === "user_offer_current") return { data: [], error: null };
    rpcCalls.push({ fn, args });
    if (fn === "redeem_courtesy_coupon") return { data: courtesyOutcome, error: null };
    if (fn === "reserve_coupon") {
      return {
        data: [
          {
            status: reserveStatus,
            reservation_id: reserveStatus === "ok" ? "res-1" : null,
            discount_type: "percent",
            value: 100,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  };
});

function form(coupon: string, method = "pix"): FormData {
  const f = new FormData();
  f.set("acceptTerms", "on"); // aceite dos termos (obrigatório no checkout)
  f.set("eventId", "11111111-1111-4111-8111-111111111111");
  f.set("cpf", "52998224725");
  f.set("method", method);
  f.set("coupon", coupon);
  return f;
}

describe("checkout com cupom", () => {
  // Aquece o import pesado da action (evita timeout do 1º teste sob carga no CI).
  beforeAll(async () => {
    await import("@/app/(dashboard)/eventos/actions");
  }, 60_000);

  it("cortesia ⇒ ativa via RPC atômica, total 0, NENHUMA chamada ao Asaas", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("eventeia-free-277560"));
    expect(state.error).toBeUndefined();
    expect(state.courtesy).toEqual({ activated: true });
    expect(state.applied).toMatchObject({ finalCents: 0, discountCents: 9700 });
    expect(calls).toHaveLength(0);
    expect(rpcCalls).toEqual([
      {
        fn: "redeem_courtesy_coupon",
        args: {
          p_code: "EVENTEIA-FREE-277560",
          p_profile_id: "user-1",
          p_event_id: "11111111-1111-4111-8111-111111111111",
        },
      },
    ]);
    expect(db.tables.payments).toHaveLength(0);
  });

  it("cortesia esgotada/já usada ⇒ erro claro e sem Asaas", async () => {
    courtesyOutcome = "already_used";
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("EVENTEIA-FREE-277560"));
    expect(state.error).toMatch(/uma vez por conta/);
    expect(calls).toHaveLength(0);
  });

  it("regressão: cupom 100% comum não zera (piso R$ 47) e reserva antes de cobrar", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("TUDO100", "card"));
    expect(state.error).toBeUndefined();
    expect(state.applied).toMatchObject({ finalCents: 4700 });
    expect(calls[0]?.body).toMatchObject({ value: 47 });
    expect(rpcCalls.map((c) => c.fn)).toEqual(["reserve_coupon", "attach_coupon_reservation"]);
    expect(rpcCalls[1]?.args).toMatchObject({ p_reservation_id: "res-1" });
  });

  it("uso único por conta: reserva recusada ⇒ sem cobrança no Asaas", async () => {
    reserveStatus = "already_used";
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("TUDO100"));
    expect(state.error).toMatch(/uma vez por conta/);
    expect(calls).toHaveLength(0);
  });

  it("limite global atingido (concorrência resolvida no banco) ⇒ esgotado", async () => {
    reserveStatus = "exhausted";
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form("TUDO100"));
    expect(state.error).toBe("Cupom esgotado.");
    expect(calls).toHaveLength(0);
  });
});
