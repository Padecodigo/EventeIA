import { describe, expect, it } from "vitest";

import { classifyAsaasEvent, isTransitionAllowed } from "@/lib/asaas/webhook";

describe("classificação de webhooks Asaas", () => {
  it("mapeia eventos conhecidos para status internos", () => {
    expect(classifyAsaasEvent("PAYMENT_RECEIVED")).toEqual({
      status: "paid",
      activatesTicket: true,
    });
    expect(classifyAsaasEvent("PAYMENT_OVERDUE")).toEqual({
      status: "overdue",
      activatesTicket: false,
    });
    expect(classifyAsaasEvent("PAYMENT_REFUNDED")).toEqual({
      status: "refunded",
      activatesTicket: false,
    });
    expect(classifyAsaasEvent("PAYMENT_AWAITING_RISK_ANALYSIS")?.status).toBe("risk_review");
    expect(classifyAsaasEvent("PAYMENT_CHARGEBACK_REQUESTED")?.status).toBe("chargeback");
  });

  it("ignora eventos desconhecidos", () => {
    expect(classifyAsaasEvent("PAYMENT_ALGO_NOVO")).toBeNull();
  });
});

describe("máquina de estados de pagamento", () => {
  it("permite transições previstas", () => {
    expect(isTransitionAllowed("pending", "paid")).toBe(true);
    expect(isTransitionAllowed("pending", "overdue")).toBe(true);
    expect(isTransitionAllowed("overdue", "paid")).toBe(true);
    expect(isTransitionAllowed("paid", "refunded")).toBe(true);
    expect(isTransitionAllowed("paid", "chargeback")).toBe(true);
    expect(isTransitionAllowed("risk_review", "paid")).toBe(true);
  });

  it("bloqueia regressões e estados finais", () => {
    expect(isTransitionAllowed("paid", "pending")).toBe(false);
    expect(isTransitionAllowed("refunded", "paid")).toBe(false);
    expect(isTransitionAllowed("chargeback", "paid")).toBe(false);
  });
});

describe("cartão de crédito/débito", () => {
  it("PAYMENT_CONFIRMED (cartão) ativa o tíquete como paid", () => {
    expect(classifyAsaasEvent("PAYMENT_CONFIRMED")).toEqual({ status: "paid", activatesTicket: true });
  });
  it("disputa/reversão de chargeback não concede nada (apenas registro)", () => {
    expect(classifyAsaasEvent("PAYMENT_CHARGEBACK_DISPUTE")).toBeNull();
    expect(classifyAsaasEvent("PAYMENT_AWAITING_CHARGEBACK_REVERSAL")).toBeNull();
  });
});

