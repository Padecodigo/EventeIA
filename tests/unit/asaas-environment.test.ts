import { describe, expect, it } from "vitest";

import { buildSimulatedPaymentReceived, resolveAsaasBaseUrl } from "@/lib/asaas/environment";

describe("resolveAsaasBaseUrl", () => {
  it("sandbox por padrão e production explícito", () => {
    expect(resolveAsaasBaseUrl({})).toBe("https://sandbox.asaas.com/api/v3");
    expect(resolveAsaasBaseUrl({ environment: "sandbox" })).toBe("https://sandbox.asaas.com/api/v3");
    expect(resolveAsaasBaseUrl({ environment: "production" })).toBe("https://api.asaas.com/v3");
  });
  it("override explícito vence (sem barra final)", () => {
    expect(resolveAsaasBaseUrl({ environment: "production", overrideUrl: "http://mock:4010/v3/" })).toBe(
      "http://mock:4010/v3",
    );
    expect(resolveAsaasBaseUrl({ environment: "production", overrideUrl: "" })).toBe("https://api.asaas.com/v3");
  });
  it("monta PAYMENT_RECEIVED simulado", () => {
    expect(buildSimulatedPaymentReceived({ asaasPaymentId: "pay_1", webhookEventId: "evt_1" })).toEqual({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", status: "RECEIVED", billingType: "PIX" },
    });
  });
});
