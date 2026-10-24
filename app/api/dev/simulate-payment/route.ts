import { NextResponse } from "next/server";

import { z } from "zod";

import { buildSimulatedPaymentReceived } from "@/lib/asaas/environment";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    asaasPaymentId: z.string().min(3).max(100),
    /** Repetir o mesmo id prova a idempotência (2ª chamada: duplicated). */
    webhookEventId: z.string().min(3).max(100).optional(),
    subscriptionId: z.string().min(3).max(100).optional(),
  })
  .strict();

function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/**
 * SOMENTE desenvolvimento: simula PAYMENT_RECEIVED do Asaas e o envia ao
 * webhook real (com o token no header). Qualquer outro NODE_ENV ⇒ 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return notFound();
  }

  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (token === undefined || token.length === 0) {
    return NextResponse.json({ error: "ASAAS_WEBHOOK_TOKEN ausente" }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payload = buildSimulatedPaymentReceived({
    asaasPaymentId: parsed.data.asaasPaymentId,
    webhookEventId: parsed.data.webhookEventId ?? `evt_sim_${crypto.randomUUID()}`,
    subscriptionId: parsed.data.subscriptionId,
  });

  const webhookUrl = new URL("/api/webhooks/asaas", request.url);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);
  logger.info({ status: response.status, eventId: payload.id }, "pagamento simulado (dev)");
  return NextResponse.json({ webhookStatus: response.status, webhook: body, payload });
}
