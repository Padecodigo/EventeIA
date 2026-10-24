/**
 * Seleção de ambiente Asaas (puro, testável).
 * ASAAS_ENVIRONMENT=sandbox (padrão) | production. ASAAS_API_URL, se definido,
 * sobrepõe (compatibilidade com .env antigos).
 */

export const ASAAS_BASE_URLS = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
} as const;

export type AsaasEnvironment = keyof typeof ASAAS_BASE_URLS;

export function resolveAsaasBaseUrl(input: {
  environment?: string;
  overrideUrl?: string;
}): string {
  if (input.overrideUrl !== undefined && input.overrideUrl.length > 0) {
    return input.overrideUrl.replace(/\/+$/, "");
  }
  return input.environment === "production" ? ASAAS_BASE_URLS.production : ASAAS_BASE_URLS.sandbox;
}

/** Payload PAYMENT_RECEIVED simulado (somente desenvolvimento). */
export function buildSimulatedPaymentReceived(input: {
  asaasPaymentId: string;
  webhookEventId: string;
  subscriptionId?: string;
}): { id: string; event: "PAYMENT_RECEIVED"; payment: Record<string, string> } {
  return {
    id: input.webhookEventId,
    event: "PAYMENT_RECEIVED",
    payment: {
      id: input.asaasPaymentId,
      status: "RECEIVED",
      billingType: "PIX",
      ...(input.subscriptionId !== undefined ? { subscription: input.subscriptionId } : {}),
    },
  };
}
