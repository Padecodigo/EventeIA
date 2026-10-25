import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

/**
 * Regressão: evento ativado por CUPOM DE CORTESIA com a entrevista já feita
 * nunca enfileirava a descoberta/coleta — a tela ficava eternamente em
 * "Salvando…/preparando" e nenhuma cotação era pedida.
 */
let db: FakeDb;
const EVENT = "11111111-1111-4111-8111-111111111111";
const enqueued: { queue: string; job: string; data: Record<string, unknown> }[] = [];

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "user-1", email: "a@b.com" }) }));
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
vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: {
    supplierDiscovery: "supplier-discovery-queue",
    whatsappSessionLifecycle: "whatsapp-session-lifecycle",
  },
  enqueue: async (queue: string, job: string, data: Record<string, unknown>) => {
    enqueued.push({ queue, job, data });
    return true;
  },
  getRedisConnection: () => ({}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-falsa-para-testes-0123456789");
  vi.stubEnv("ASAAS_API_KEY", "chave-falsa-de-teste");
  vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
  vi.stubEnv("B2C_TICKET_PRICE_CENTS", "9700");
  enqueued.length = 0;
  db = createFakeDb({
    events: [
      {
        id: EVENT,
        title: "Aniversário",
        status: "draft",
        interview_completed_at: "2026-10-25T00:43:37Z",
      },
    ],
    event_tickets: [],
    profiles: [
      { id: "user-1", display_name: "Ana", document_number: null, asaas_customer_id: "cus_1" },
    ],
    payments: [],
    coupons: [
      {
        id: "c-free",
        code: "EVENTEIA-FREE-1",
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
  db.rpc = async (fn) => {
    if (fn === "redeem_courtesy_coupon") {
      // A RPC real ativa evento + tíquete numa transação (0030).
      const ev = db.tables.events?.[0];
      if (ev !== undefined) ev.status = "active";
      return { data: "activated", error: null };
    }
    return { data: null, error: null };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
});

function form(): FormData {
  const f = new FormData();
  f.set("eventId", EVENT);
  f.set("cpf", "52998224725");
  f.set("coupon", "eventeia-free-1");
  return f;
}

describe("cortesia ⇒ descoberta de fornecedores", () => {
  it("entrevista já concluída: enfileira a 1ª rodada e o prazo de coleta", async () => {
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    const state = await buyTicketAction({}, form());
    expect(state.courtesy).toEqual({ activated: true });
    expect(enqueued.map((e) => `${e.queue}:${e.job}`)).toEqual([
      "whatsapp-session-lifecycle:collection-deadline",
      "supplier-discovery-queue:discover",
    ]);
    expect(enqueued[1]?.data).toEqual({ eventId: EVENT, round: 0 });
  });

  it("entrevista ainda não feita: não enfileira (a entrevista inicia depois)", async () => {
    const ev = db.tables.events?.[0];
    if (ev !== undefined) ev.interview_completed_at = null;
    const { buyTicketAction } = await import("@/app/(dashboard)/eventos/actions");
    await buyTicketAction({}, form());
    expect(enqueued).toHaveLength(0);
  });
});
