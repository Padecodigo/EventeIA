import "server-only";

import { z } from "zod";

import { resolveAsaasBaseUrl } from "@/lib/asaas/environment";
import { isConfigured, serverEnv } from "@/lib/env";

/**
 * Cliente REST mínimo da API Asaas v3 (Pix dinâmico e cartão).
 * Valores sempre em centavos na nossa fronteira; convertidos apenas na chamada.
 */

const customerResponseSchema = z.object({ id: z.string() });

const paymentResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  invoiceUrl: z.string().url().optional(),
  externalReference: z.string().nullish(),
});

const pixQrResponseSchema = z.object({
  encodedImage: z.string(),
  payload: z.string(),
  expirationDate: z.string().optional(),
});

export class AsaasNotConfiguredError extends Error {
  constructor() {
    super("Pagamentos indisponíveis: ASAAS_API_KEY não configurada neste ambiente.");
    this.name = "AsaasNotConfiguredError";
  }
}

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const env = serverEnv();
  const apiKey = env.ASAAS_API_KEY;

  if (!isConfigured(apiKey)) {
    throw new AsaasNotConfiguredError();
  }

  const baseUrl = resolveAsaasBaseUrl({
    environment: env.ASAAS_ENVIRONMENT,
    overrideUrl: env.ASAAS_API_URL,
  });
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Asaas ${String(response.status)} em ${path}: ${text.slice(0, 300)}`);
  }

  const parsed: unknown = JSON.parse(text);
  return schema.parse(parsed);
}

export interface CreateCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
}

export async function createAsaasCustomer(input: CreateCustomerInput): Promise<string> {
  const body = {
    name: input.name,
    cpfCnpj: input.cpfCnpj,
    email: input.email,
  };
  const customer = await request(
    "/customers",
    { method: "POST", body: JSON.stringify(body) },
    customerResponseSchema,
  );
  return customer.id;
}

export interface CreatePixPaymentInput {
  customerId: string;
  amountCents: number;
  externalReference: string;
  description: string;
  dueDate: string;
}

export interface CreatedPixPayment {
  paymentId: string;
  invoiceUrl?: string;
  pix: { payload: string; encodedImage: string; expirationDate?: string };
}

export async function createAsaasPixPayment(
  input: CreatePixPaymentInput,
): Promise<CreatedPixPayment> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("amountCents inválido para o Asaas");
  }

  const payment = await request(
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType: "PIX",
        value: input.amountCents / 100,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
      }),
    },
    paymentResponseSchema,
  );

  const pix = await request(
    `/payments/${payment.id}/pixQrCode`,
    { method: "GET" },
    pixQrResponseSchema,
  );

  return {
    paymentId: payment.id,
    invoiceUrl: payment.invoiceUrl,
    pix: {
      payload: pix.payload,
      encodedImage: pix.encodedImage,
      expirationDate: pix.expirationDate,
    },
  };
}

/**
 * Consulta de cobrança (conciliação diária). `subscription` presente em faturas.
 */
export async function getAsaasPayment(
  paymentId: string,
): Promise<{ id: string; status: string; subscription: string | null }> {
  const payment = await request(
    `/payments/${paymentId}`,
    { method: "GET" },
    z.object({
      id: z.string(),
      status: z.string(),
      subscription: z.string().nullish(),
    }),
  );

  return { id: payment.id, status: payment.status, subscription: payment.subscription ?? null };
}

/** Cria assinatura mensal no Asaas (uma fatura Pix por ciclo). */
export async function createAsaasSubscription(input: {
  customerId: string;
  priceCents: number;
  description: string;
  nextDueDate: string;
}): Promise<{ subscriptionId: string; status: string }> {
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    throw new Error("priceCents inválido para assinatura");
  }

  const subscription = await request(
    "/subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType: "PIX",
        cycle: "MONTHLY",
        value: input.priceCents / 100,
        description: input.description,
        nextDueDate: input.nextDueDate,
      }),
    },
    z.object({
      id: z.string(),
      status: z.string().optional(),
    }),
  );

  return { subscriptionId: subscription.id, status: subscription.status ?? "ACTIVE" };
}
