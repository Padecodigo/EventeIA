import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: buyCreditsAction (slider e pacotes legados) → cobrança Asaas → payments
 * pendente → webhook pago concede exatamente N créditos (contrato da 0008:
 * credits_granted * 100 no credit_ledger, idempotente por asaas_payment_id).
 */
const pixCalls: { amountCents: number; externalReference: string }[] = [];
const payments: Record<string, unknown>[] = [];
const cardCalls: { amountCents: number; externalReference: string }[] = [];

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "user-1", email: "a@b.com" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/feeds", () => ({ emitFeed: async () => undefined }));
vi.mock("@/lib/asaas/client", () => ({
  AsaasNotConfiguredError: class extends Error {},
  createAsaasCustomer: async () => "cus_1",
  createAsaasSubscription: async () => ({ subscriptionId: "sub_1" }),
  createAsaasCardPayment: async (input: { amountCents: number; externalReference: string }) => {
    cardCalls.push(input);
    return {
      paymentId: `card_${String(cardCalls.length)}`,
      invoiceUrl: "https://www.asaas.com/i/card",
    };
  },
  createAsaasPixPayment: async (input: { amountCents: number; externalReference: string }) => {
    pixCalls.push(input);
    return {
      paymentId: `pay_${String(pixCalls.length)}`,
      invoiceUrl: "https://x",
      pix: { payload: "PIX", expirationDate: "2026-01-01" },
    };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) }),
}));
function chain(table: string) {
  const single = async () => {
    if (table === "workspaces") return { data: { id: "ws-1" } };
    if (table === "profiles")
      return {
        data: { display_name: "Ana", document_number: "12345678901", asaas_customer_id: "cus_1" },
      };
    return { data: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit", "in"]) q[m] = () => q;
  q.maybeSingle = single;
  q.insert = (row: Record<string, unknown>) => {
    payments.push(row);
    const id = `p-${String(payments.length)}`;
    return {
      select: () => ({ single: async () => ({ data: { id }, error: null }) }),
    };
  };
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: chain }),
}));

const { buyCreditsAction } = await import("@/app/(dashboard)/creditos/actions");
const { customCreditsPriceCents } = await import("@/lib/credit-slider");

/** Réplica do ramo credit_topup de process_payment_webhook (0008), idempotente. */
function applyPaidWebhook(ledger: Map<string, number>, payment: Record<string, unknown>) {
  if (payment.purpose !== "credit_topup" || payment.credits_granted == null) return;
  const key = `topup:${String(payment.asaas_payment_id)}`;
  if (!ledger.has(key)) ledger.set(key, (payment.credits_granted as number) * 100);
}

function form(entries: Record<string, string>) {
  const fd = new FormData();
  fd.set("acceptTerms", "on"); // aceite dos termos (obrigatório no checkout)
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  pixCalls.length = 0;
  payments.length = 0;
});

describe("compra pelo slider", () => {
  it("para cada N em 3..20 cobra o preço do servidor e concede N créditos no webhook", async () => {
    for (let n = 3; n <= 20; n++) {
      const res = await buyCreditsAction({}, form({ credits: String(n), priceCents: "100" }));
      expect(res.pix?.payload).toBe("PIX");
      const call = pixCalls.at(-1)!;
      const row = payments.at(-1)!;
      expect(call.amountCents).toBe(customCreditsPriceCents(n));
      expect(row.amount_cents).toBe(customCreditsPriceCents(n));
      expect(row).toMatchObject({ credits_granted: n, status: "pending", purpose: "credit_topup" });
      const ledger = new Map<string, number>();
      applyPaidWebhook(ledger, row);
      applyPaidWebhook(ledger, row); // reentrega do webhook
      expect([...ledger.values()]).toEqual([n * 100]);
    }
  });

  it("rejeita quantidade fora de 3..20 sem cobrar", async () => {
    for (const bad of ["2", "21", "7.5", "abc", ""]) {
      expect(await buyCreditsAction({}, form({ credits: bad }))).toEqual({
        error: "Pacote inválido.",
      });
    }
    expect(pixCalls).toHaveLength(0);
  });

  it("regressão: pacotes legados por packageCode continuam funcionando", async () => {
    const expected = {
      "pacote-3": [3, 11_700],
      "pacote-7": [7, 19_700],
      "pacote-17": [17, 39_700],
    } as const;
    for (const [code, [credits, cents]] of Object.entries(expected)) {
      await buyCreditsAction({}, form({ packageCode: code }));
      expect(payments.at(-1)).toMatchObject({ credits_granted: credits, amount_cents: cents });
      expect(pixCalls.at(-1)!.externalReference).toBe(`topup:ws-1:${code}`);
    }
    expect(await buyCreditsAction({}, form({ packageCode: "pacote-99" }))).toEqual({
      error: "Pacote inválido.",
    });
  });
});

describe("créditos — Pix ou cartão de crédito", () => {
  function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    f.set("acceptTerms", "on"); // aceite dos termos (obrigatório no checkout)
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  }

  it("cartão ⇒ cobrança CREDIT_CARD via Fatura, payment pendente com o preço do servidor", async () => {
    payments.length = 0;
    cardCalls.length = 0;
    const before = pixCalls.length;
    const state = await buyCreditsAction({}, fd({ credits: "10", method: "card" }));
    expect(state).toEqual({ card: { invoiceUrl: "https://www.asaas.com/i/card" } });
    expect(pixCalls.length).toBe(before);
    expect(cardCalls[0]?.amountCents).toBe(customCreditsPriceCents(10));
    expect(payments[0]).toMatchObject({
      billing_type: "CREDIT_CARD",
      credits_granted: 10,
      status: "pending",
      asaas_payment_id: "card_1",
    });
  });

  it("regressão: sem método ⇒ Pix; método inválido (boleto) recusado sem cobrança", async () => {
    payments.length = 0;
    cardCalls.length = 0;
    const pix = await buyCreditsAction({}, fd({ credits: "5" }));
    expect(pix.pix?.payload).toBe("PIX");
    expect(payments[0]).toMatchObject({ billing_type: "PIX" });
    const before = pixCalls.length;
    const bad = await buyCreditsAction({}, fd({ credits: "5", method: "boleto" }));
    expect(bad.error).toBeDefined();
    expect(pixCalls.length).toBe(before);
    expect(cardCalls).toHaveLength(0);
  });
});
