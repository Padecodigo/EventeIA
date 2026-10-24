import { NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { verifyAsaasWebhookToken } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const envelopeSchema = z
  .object({
    id: z.string().optional(),
    event: z.string().min(1),
    // passthrough: preserva `subscription` (faturas de assinatura) e outros campos do Asaas.
    payment: z
      .object({ id: z.string(), status: z.string() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * Webhook do Asaas — protocolo idempotente (ver .context/PAYMENTS.md §4).
 * 1) valida token em tempo constante; 2) registra/deduplica em webhook_events;
 * 3) enfileira o processamento e responde 2xx rápido.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = request.headers.get("asaas-access-token");

  if (!verifyAsaasWebhookToken(token)) {
    logger.warn({ ip: request.headers.get("x-forwarded-for") }, "webhook asaas rejeitado (token)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payload = parsed.data;
  const externalEventId = payload.id ?? `${payload.event}:${payload.payment?.id ?? "sem-payment"}`;

  try {
    const admin = getSupabaseAdmin();
    const { data: inserted, error } = await admin
      .from("webhook_events")
      .upsert(
        {
          source: "asaas",
          external_event_id: externalEventId,
          payload: payload as unknown as Json,
          status: "received",
        },
        { onConflict: "source,external_event_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (error !== null) {
      logger.error({ code: error.code }, "falha ao registrar webhook asaas");
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }

    if (inserted === null) {
      logger.info({ externalEventId }, "webhook asaas duplicado ignorado");
      return NextResponse.json({ ok: true, duplicated: true });
    }

    const enqueued = await enqueue(
      QUEUE_NAMES.asaasWebhooks,
      "process",
      { webhookEventId: inserted.id },
      { jobId: inserted.id },
    );

    if (!enqueued) {
      // Evento persistido; a conciliação diária cobre a fila indisponível (PAYMENTS.md §8).
      logger.error({ webhookEventId: inserted.id }, "fila indisponível ao enfileirar webhook asaas");
    }

    return NextResponse.json({ ok: true });
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "erro inesperado no webhook asaas",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
