import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

/**
 * Ofertas pessoais (0036) no checkout: boas-vindas R$ 40 avulso / 30% pacotes,
 * cupom pessoal, sem acumular com cupom digitado, prazo e uso único no servidor.
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
const legacyWelcome = vi.fn(async () => null);
vi.mock("@/lib/welcome/server", () => ({
  bindWelcomeOfferToUser: async () => undefined,
  reserveWelcomeOffer: () => legacyWelcome(),
}));
vi.mock("@/lib/lucky/server", () => ({ reserveLuckyCoupon: async () => null }));
vi.mock("@/lib/feeds", () => ({ emitFeed: async () => undefined }));
vi.mock("@/lib/queue", () => ({ enqueue: async () => true, QUEUE_NAMES: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const EVENT = "11111111-1111-4111-8111-111111111111";
const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let offer: Record<string, unknown> | null;
let claimOk = true;
let asaasFails = false;

function activeOffer(kind: "welcome" | "personal", hoursLeft = 47): Record<string, unknown> {
  const now = new Date("2026-10-24T12:00:00Z");
  return {
    id: `offer-${kind}`,
    kind,
    code: kind === "welcome" ? "BOASVINDAS-AAAA1111" : "PRAVOCE-BBBB2222",
    avulso_off_cents: kind === "welcome" ? 4000 : 2000,
    pack_percent: kind === "welcome" ? 30 : 20,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + hoursLeft * 3600_000).toISOString(),
    status: hoursLeft > 0 ? "active" : "expired",
    server_now: now.toISOString(),
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-falsa-para-testes-0123456789");
  vi.stubEnv("ASAAS_API_KEY", "chave-falsa-de-teste");
  vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
  vi.stubEnv("B2C_TICKET_PRICE_CENTS", "9700");
  calls.length = 0;
  rpcCalls.length = 0;
  offer = activeOffer("welcome");
  claimOk = true;
  asaasFails = false;
  legacyWelcome.mockClear();
  db = createFakeDb({
    events: [{ id: EVENT, title: "Casamento", status: "draft" }],
    event_tickets: [],
    profiles: [
      {
        id: "user-1",
        display_name: "Ana",
        document_number: "52998224725",
        asaas_customer_id: "cus_1",
      },
    ],
    workspaces: [{ id: "ws-1", owner_id: "user-1" }],
    subscriptions: [],
    payments: [],
    coupons: [
      {
        id: "c-10",
        code: "DEZ",
        discount_type: "percent",
        value: 10,
        active: true,
        expires_at: null,
        max_redemptions: null,
        redemptions: 0,
      },
      {
        id: "c-90",
        code: "NOVENTA",
        discount_type: "percent",
        value: 90,
        active: true,
        expires_at: null,
        max_redemptions: null,
        redemptions: 0,
      },
      {
        id: "c-free",
        code: "CORTESIA",
        discount_type: "free",
        value: 9700,
        active: true,
        expires_at: null,
        max_redemptions: 1,
        redemptions: 0,
      },
    ],
    coupon_redemptions: [],
  });
  db.rpc = async (fn, args) => {
    rpcCalls.push({ fn, args });
    if (fn === "user_offer_current") return { data: offer === null ? [] : [offer], error: null };
    if (fn === "user_offer_claim") return { data: claimOk, error: null };
    if (fn === "reserve_coupon") {
      return {
        data: [{ status: "ok", reservation_id: "res-1", discount_type: "percent", value: 10 }],
        error: null,
      };
    }
    if (fn === "redeem_courtesy_coupon") return { data: "activated", error: null };
    return { data: null, error: null };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (asaasFails) return new Response("boom", { status: 500 });
      if (url.endsWith("/pixQrCode")) {
        return new Response(JSON.stringify({ encodedImage: "img", payload: "000201PIX" }));
      }
      if (url.endsWith("/subscriptions"))
        return new Response(JSON.stringify({ id: "sub_1", status: "ACTIVE" }));
      if (url.endsWith("/subscriptions/sub_1/payments")) {
        return new Response(JSON.stringify({ data: [{ id: "pay_first" }] }));
      }
      if (url.endsWith("/payments/pay_first"))
        return new Response(JSON.stringify({ id: "pay_first" }));
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

function ticketForm(coupon = "", method = "pix"): FormData {
  const f = new FormData();
  f.set("eventId", EVENT);
  f.set("cpf", "52998224725");
  f.set("method", method);
  f.set("coupon", coupon);
  return f;
}
const fns = () => rpcCalls.map((c) => c.fn);
const asaasValue = () => calls.find((c) => c.body?.value !== undefined)?.body?.value;

describe("evento avulso", () => {
  // Aquece o import pesado da action (evita timeout do 1º teste sob carga no CI).
  beforeAll(async () => {
    await import("@/app/(dashboard)/eventos/actions");
  }, 60_000);

  it("boas-vindas ativa ⇒ R$ 97 − R$ 40 = R$ 57, resgata e vincula ao pagamento", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm());
    expect(state.error).toBeUndefined();
    expect(state.applied).toEqual({
      code: "BOASVINDAS-AAAA1111",
      finalCents: 5700,
      discountCents: 4000,
    });
    expect(asaasValue()).toBe(57);
    expect(fns()).toEqual(["user_offer_current", "user_offer_claim", "user_offer_attach"]);
    expect(db.tables.payments?.[0]).toMatchObject({
      amount_cents: 5700,
      discount_cents: 4000,
      coupon_code: "BOASVINDAS-AAAA1111",
    });
    expect(legacyWelcome).not.toHaveBeenCalled();
  });

  it("cupom pessoal (Quer cupom?) ⇒ R$ 20 off", async () => {
    offer = activeOffer("personal");
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm());
    expect(state.applied).toMatchObject({ finalCents: 7700, discountCents: 2000 });
  });

  it("sem acumular: cupom menor (10%) ⇒ vale a oferta e o cupom NÃO é reservado", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm("dez"));
    expect(state.applied).toMatchObject({ code: "BOASVINDAS-AAAA1111", finalCents: 5700 });
    expect(fns()).not.toContain("reserve_coupon");
  });

  it("sem acumular: cupom maior (90%) ⇒ vale o cupom, oferta fica intacta", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm("NOVENTA"));
    expect(state.applied).toMatchObject({ code: "NOVENTA", finalCents: 4700 });
    expect(fns()).toContain("reserve_coupon");
    expect(fns()).not.toContain("user_offer_claim");
  });

  it("cortesia continua tendo prioridade (total 0, sem Asaas)", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm("CORTESIA"));
    expect(state.courtesy).toEqual({ activated: true });
    expect(calls).toHaveLength(0);
    expect(fns()).not.toContain("user_offer_claim");
  });

  it("expirada ⇒ desconto some de verdade (preço cheio, cai no fluxo legado)", async () => {
    offer = activeOffer("welcome", -1);
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm());
    expect(state.applied).toBeUndefined();
    expect(asaasValue()).toBe(97);
    expect(fns()).not.toContain("user_offer_claim");
  });

  it("já usada/expirou entre a página e o clique (claim recusado no banco) ⇒ erro, sem cobrança", async () => {
    claimOk = false;
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm());
    expect(state.error).toMatch(/expirou ou já foi usada/);
    expect(calls).toHaveLength(0);
  });

  it("falha no Asaas ⇒ oferta devolvida", async () => {
    asaasFails = true;
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, ticketForm());
    expect(state.error).toBeDefined();
    expect(fns()).toContain("user_offer_release");
  });

  it("prévia do 'Tem um cupom?' avisa quando a oferta é maior", async () => {
    const { applyCouponAction } = await import("@/app/(dashboard)/eventos/actions");
    const f = new FormData();
    f.set("code", "dez");
    const preview = await applyCouponAction({}, f);
    expect(preview).toMatchObject({ ok: true, offerWins: true, finalCents: 5700 });
    expect(fns()).not.toContain("reserve_coupon");
    expect(fns()).not.toContain("user_offer_claim");
  });
});

describe("pacotes, slider e franquia", () => {
  it("slider 7 créditos (R$ 197) ⇒ 30% off = R$ 137,90", async () => {
    const { buyCreditsAction } = await import("@/app/(dashboard)/creditos/actions");
    const f = new FormData();
    f.set("credits", "7");
    const state = await buyCreditsAction({}, f);
    expect(state.applied).toEqual({
      code: "BOASVINDAS-AAAA1111",
      discountCents: 5910,
      finalCents: 13_790,
    });
    expect(asaasValue()).toBe(137.9);
    expect(db.tables.payments?.[0]).toMatchObject({ amount_cents: 13_790, credits_granted: 7 });
    expect(fns()).toContain("user_offer_attach");
  });

  it("cupom digitado no pacote (maior que a oferta) é reservado e vinculado", async () => {
    offer = null;
    const { buyCreditsAction } = await import("@/app/(dashboard)/creditos/actions");
    const f = new FormData();
    f.set("packageCode", "pacote-3");
    f.set("coupon", "DEZ");
    const state = await buyCreditsAction({}, f);
    expect(state.applied).toMatchObject({ code: "DEZ", discountCents: 1170, finalCents: 10_530 });
    expect(fns()).toEqual(["user_offer_current", "reserve_coupon", "attach_coupon_reservation"]);
  });

  it("cortesia não vale para pacote", async () => {
    const { buyCreditsAction } = await import("@/app/(dashboard)/creditos/actions");
    const f = new FormData();
    f.set("credits", "3");
    f.set("coupon", "CORTESIA");
    const state = await buyCreditsAction({}, f);
    expect(state.error).toMatch(/evento avulso/);
    expect(calls).toHaveLength(0);
  });

  it("sem oferta e sem cupom ⇒ preço cheio (regressão)", async () => {
    offer = null;
    const { buyCreditsAction } = await import("@/app/(dashboard)/creditos/actions");
    const f = new FormData();
    f.set("credits", "3");
    const state = await buyCreditsAction({}, f);
    expect(state.applied).toBeUndefined();
    expect(asaasValue()).toBe(117);
  });

  it("franquia: 30% SÓ na 1ª fatura (assinatura segue com valor cheio)", async () => {
    const { subscribeToPlanAction } = await import("@/app/(dashboard)/creditos/actions");
    const f = new FormData();
    f.set("planCode", "atelier");
    f.set("renew", "yes");
    const state = await subscribeToPlanAction({}, f);
    expect(state.success).toBe(true);
    expect(state.applied).toEqual({
      code: "BOASVINDAS-AAAA1111",
      discountCents: 5910,
      finalCents: 13_790,
    });
    const sub = calls.find((c) => c.url.endsWith("/subscriptions"));
    expect(sub?.body?.value).toBe(197);
    const first = calls.find((c) => c.url.endsWith("/payments/pay_first"));
    expect(first?.body).toEqual({ value: 137.9 });
    expect(db.tables.payments?.[0]).toMatchObject({
      purpose: "subscription_invoice",
      asaas_payment_id: "pay_first",
      amount_cents: 13_790,
      status: "pending",
    });
  });
});

describe("'Quer cupom?'", () => {
  it("intervalo de 90 dias é enviado ao banco; cooldown devolve a data", async () => {
    db.rpc = async (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "user_offer_request") {
        return {
          data: [{ status: "cooldown", offer_id: null, next_at: "2027-01-20T00:00:00Z" }],
          error: null,
        };
      }
      return { data: null, error: null };
    };
    const { requestOfferAction } = await import("@/app/actions/offers");
    const state = await requestOfferAction({}, new FormData());
    expect(state).toEqual({ cooldownUntil: "2027-01-20T00:00:00Z" });
    expect(rpcCalls[0]).toEqual({
      fn: "user_offer_request",
      args: { p_profile_id: "user-1", p_cooldown_days: 90 },
    });
  });

  it("emite e devolve o código com prazo do banco", async () => {
    offer = activeOffer("personal", 48);
    const current = offer;
    db.rpc = async (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "user_offer_request")
        return {
          data: [{ status: "created", offer_id: "offer-personal", next_at: null }],
          error: null,
        };
      if (fn === "user_offer_current") return { data: [current], error: null };
      return { data: null, error: null };
    };
    const { requestOfferAction } = await import("@/app/actions/offers");
    const state = await requestOfferAction({}, new FormData());
    expect(state.offer).toMatchObject({
      code: "PRAVOCE-BBBB2222",
      isNew: true,
      remainingMs: 48 * 3600_000,
    });
  });
});
