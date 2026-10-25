import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: franquia com "Renovar automaticamente todo mês?".
 * Sim ⇒ assinatura Asaas recorrente (Pix ou cartão de crédito); Não ⇒ compra
 * única dos créditos do plano (credit_topup). Cancelamento pelo painel.
 */
const subCalls: { billingType?: string; priceCents: number }[] = [];
const cancelCalls: string[] = [];
const pixCalls: { amountCents: number; externalReference: string }[] = [];
const inserts: { table: string; row: Record<string, unknown> }[] = [];
const updates: { table: string; row: Record<string, unknown> }[] = [];
let existingSub: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  requireUser: () => Promise.resolve({ id: "user-1", email: "a@b.com" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/feeds", () => ({ emitFeed: () => Promise.resolve() }));
vi.mock("@/lib/asaas/client", () => ({
  AsaasNotConfiguredError: class extends Error {},
  createAsaasCustomer: () => Promise.resolve("cus_1"),
  createAsaasSubscription: (input: { billingType?: string; priceCents: number }) => {
    subCalls.push(input);
    return Promise.resolve({ subscriptionId: "sub_1", status: "ACTIVE" });
  },
  getAsaasSubscriptionFirstInvoiceUrl: () => Promise.resolve("https://www.asaas.com/i/sub1"),
  cancelAsaasSubscription: (id: string) => {
    cancelCalls.push(id);
    return Promise.resolve();
  },
  createAsaasCardPayment: () =>
    Promise.resolve({ paymentId: "card_1", invoiceUrl: "https://www.asaas.com/i/card" }),
  createAsaasPixPayment: (input: { amountCents: number; externalReference: string }) => {
    pixCalls.push(input);
    return Promise.resolve({
      paymentId: "pay_1",
      invoiceUrl: "https://x",
      pix: { payload: "PIX", expirationDate: "2026-01-01" },
    });
  },
}));
function tableApi(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit", "in"]) q[m] = () => q;
  q.maybeSingle = () => {
    if (table === "workspaces") return Promise.resolve({ data: { id: "ws-1" } });
    if (table === "profiles")
      return Promise.resolve({
        data: { display_name: "Ana", document_number: "12345678901", asaas_customer_id: "cus_1" },
      });
    if (table === "subscriptions") return Promise.resolve({ data: existingSub });
    return Promise.resolve({ data: null });
  };
  q.insert = (row: Record<string, unknown>) => {
    inserts.push({ table, row });
    const done = { data: { id: "pay-local-1" }, error: null };
    const r: Record<string, unknown> = {};
    r.select = () => r;
    r.single = () => Promise.resolve(done);
    r.maybeSingle = () => Promise.resolve(done);
    r.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
    return r;
  };
  q.update = (row: Record<string, unknown>) => {
    updates.push({ table, row });
    const u: Record<string, unknown> = {};
    u.eq = () => u;
    u.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
    return u;
  };
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: tableApi }),
}));
// Sem oferta pessoal (0036) nem cupom neste arquivo.
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: tableApi,
    rpc: () => Promise.resolve({ data: [], error: null }),
  }),
}));

const { subscribeToPlanAction, cancelSubscriptionAction } =
  await import("@/app/(dashboard)/creditos/actions");
const { PLANS } = await import("@/lib/plans");

function form(entries: Record<string, string>) {
  const fd = new FormData();
  fd.set("acceptTerms", "on"); // aceite dos termos (obrigatório no checkout)
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  subCalls.length = 0;
  cancelCalls.length = 0;
  pixCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  existingSub = null;
});

describe("franquia — renovação automática", () => {
  it("exige a escolha de renovar ou não (sem cobrar)", async () => {
    const res = await subscribeToPlanAction({}, form({ planCode: "atelier" }));
    expect(res.error).toMatch(/renovar automaticamente/);
    expect(subCalls).toHaveLength(0);
    expect(pixCalls).toHaveLength(0);
  });

  it("Sim + cartão ⇒ assinatura recorrente CREDIT_CARD e link da 1ª fatura", async () => {
    const res = await subscribeToPlanAction(
      {},
      form({ planCode: "atelier", renew: "yes", method: "card" }),
    );
    expect(res).toEqual({ success: true, invoiceUrl: "https://www.asaas.com/i/sub1" });
    expect(subCalls[0]?.billingType).toBe("CREDIT_CARD");
    expect(inserts.find((i) => i.table === "subscriptions")?.row).toMatchObject({
      plan_code: "atelier",
      status: "pending",
    });
  });

  it("Sim + Pix ⇒ assinatura recorrente PIX", async () => {
    await subscribeToPlanAction({}, form({ planCode: "essencial", renew: "yes", method: "pix" }));
    expect(subCalls[0]?.billingType).toBe("PIX");
  });

  it("Não ⇒ compra única dos créditos do plano, sem assinatura", async () => {
    const plan = PLANS.find((p) => p.code === "atelier")!;
    const res = await subscribeToPlanAction(
      {},
      form({ planCode: "atelier", renew: "no", method: "pix" }),
    );
    expect(res.pix?.payload).toBe("PIX");
    expect(subCalls).toHaveLength(0);
    expect(pixCalls[0]?.amountCents).toBe(plan.priceCents);
    expect(inserts.find((i) => i.table === "payments")?.row).toMatchObject({
      purpose: "credit_topup",
      credits_granted: plan.credits,
      amount_cents: plan.priceCents,
    });
  });

  it("cancelar renovação ⇒ cancela no Asaas e marca canceled", async () => {
    existingSub = { id: "s-1", asaas_subscription_id: "sub_1" };
    expect(await cancelSubscriptionAction({}, new FormData())).toEqual({ success: true });
    expect(cancelCalls).toEqual(["sub_1"]);
    expect(updates.find((u) => u.table === "subscriptions")?.row).toEqual({ status: "canceled" });
  });

  it("cancelar sem assinatura ativa não chama o Asaas", async () => {
    const res = await cancelSubscriptionAction({}, new FormData());
    expect(res.error).toBeDefined();
    expect(cancelCalls).toHaveLength(0);
  });
});
