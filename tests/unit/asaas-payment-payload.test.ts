import { describe, expect, it } from "vitest";

import { buildPaymentPayload } from "@/lib/asaas/client";

const base = {
  customerId: "cus_1",
  amountCents: 9700,
  externalReference: "evt-1",
  description: "EventeIA — tíquete",
  dueDate: "2026-10-25",
};

describe("buildPaymentPayload", () => {
  it("Pix: billingType PIX e valor em reais", () => {
    expect(buildPaymentPayload({ ...base, billingType: "PIX" })).toEqual({
      customer: "cus_1",
      billingType: "PIX",
      value: 97,
      dueDate: "2026-10-25",
      description: "EventeIA — tíquete",
      externalReference: "evt-1",
    });
  });

  it("Cartão: CREDIT_CARD SEM dados de cartão (Fatura hospedada, crédito/débito)", () => {
    const payload = buildPaymentPayload({ ...base, billingType: "CREDIT_CARD" });
    expect(payload.billingType).toBe("CREDIT_CARD");
    expect(payload).not.toHaveProperty("creditCard");
    expect(payload).not.toHaveProperty("creditCardHolderInfo");
  });

  it("nunca oferece boleto nem UNDEFINED", () => {
    for (const t of ["PIX", "CREDIT_CARD"] as const) {
      expect(["BOLETO", "UNDEFINED"]).not.toContain(buildPaymentPayload({ ...base, billingType: t }).billingType);
    }
  });

  it("rejeita valor zero/fracionado", () => {
    expect(() => buildPaymentPayload({ ...base, amountCents: 0, billingType: "PIX" })).toThrow();
    expect(() => buildPaymentPayload({ ...base, amountCents: 9.5, billingType: "PIX" })).toThrow();
  });
});
