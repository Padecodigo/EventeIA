import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import type { MetaWebhookJobData } from "@/lib/jobs/meta-webhook";
import { logger } from "@/lib/logger";
import { verifyChallenge, verifyHubSignature } from "@/lib/meta/signature";
import { parseMetaComments, parseMetaWebhook } from "@/lib/meta/webhook";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Webhook único do Meta (Instagram + Messenger).
 *
 * Verifica a assinatura, normaliza DMs e comentários e persiste cada evento em
 * `webhook_events` (dedup por source + external_event_id) ANTES de enfileirar o
 * processamento assíncrono (BullMQ) e responder 200 rápido. A resolução do
 * fornecedor, a interpretação do texto e o envio de respostas acontecem no
 * worker `meta-webhooks` — nunca nesta rota.
 */

/** Verificação do webhook pela Meta (hub.challenge). */
export function GET(request: Request): NextResponse {
  const challenge = verifyChallenge(
    new URL(request.url).searchParams,
    serverEnv().META_VERIFY_TOKEN,
  );
  if (challenge === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** JobId do BullMQ deduplica por chave; ':' é reservado internamente pelo BullMQ. */
function metaJobId(externalEventId: string): string {
  return `meta_${externalEventId.replaceAll(":", "_")}`;
}

/**
 * Persiste o evento e enfileira o processamento. Retorna true quando um job foi
 * enfileirado (false para duplicado já processado).
 */
async function persistAndEnqueue(
  admin: ReturnType<typeof getSupabaseAdmin>,
  kind: MetaWebhookJobData["kind"],
  externalEventId: string,
  event: MetaWebhookJobData["event"],
): Promise<boolean> {
  const { data: inserted, error } = await admin
    .from("webhook_events")
    .upsert(
      {
        // A migração 0052 relaxa o CHECK para incluir 'meta'; os tipos gerados
        // (`supabase gen types`) ainda não foram regenerados, então o cast é
        // temporário até o banco receber a 0052 e os tipos serem re-gerados.
        source: "meta" as unknown as "whatsapp_cloud",
        external_event_id: externalEventId,
        payload: event as unknown as Json,
        status: "received",
      },
      { onConflict: "source,external_event_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao persistir webhook meta");
    throw new Error("persist_failed");
  }

  let webhookEventId: string | null = null;
  if (inserted !== null) {
    webhookEventId = inserted.id;
  } else {
    // Duplicado: reenfileira apenas se o evento ainda está "received" (nunca
    // processado); o jobId mantém a operação idempotente.
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id,status")
      .eq("source", "meta" as unknown as "whatsapp_cloud")
      .eq("external_event_id", externalEventId)
      .maybeSingle();
    if (existing === null || existing.status !== "received") {
      logger.info({ externalEventId }, "webhook meta duplicado já processado — ignorando");
      return false;
    }
    webhookEventId = existing.id;
  }

  try {
    await getQueue(QUEUE_NAMES.metaWebhooks).add(
      "process",
      { kind, webhookEventId, event },
      {
        jobId: metaJobId(externalEventId),
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );
  } catch (caught) {
    logger.error(
      { externalEventId, reason: caught instanceof Error ? caught.message : "desconhecido" },
      "fila indisponível ao enfileirar webhook meta",
    );
    throw new Error("enqueue_failed");
  }
  return true;
}

/** Recebe eventos do Instagram/Messenger, valida, persiste e enfileira. */
export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();
  if (!verifyHubSignature(raw, request.headers.get("x-hub-signature-256"), serverEnv().META_APP_SECRET)) {
    logger.warn("webhook meta rejeitado (assinatura)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const messages = parseMetaWebhook(json);
  const comments = parseMetaComments(json);

  if (messages === null && comments === null) {
    // echo/read/delivery ou payload não reconhecido: confirma e ignora.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let enqueued = 0;
  for (const message of messages ?? []) {
    try {
      if (await persistAndEnqueue(admin, "message", message.eventId, message)) enqueued += 1;
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "desconhecido";
      return NextResponse.json({ error: reason }, { status: 500 });
    }
  }

  for (const comment of comments ?? []) {
    try {
      if (await persistAndEnqueue(admin, "comment", comment.commentId, comment)) enqueued += 1;
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "desconhecido";
      return NextResponse.json({ error: reason }, { status: 500 });
    }
  }

  logger.info(
    { messages: messages?.length ?? 0, comments: comments?.length ?? 0, enqueued },
    "webhook meta: eventos persistidos e enfileirados",
  );
  return NextResponse.json(
    {
      received: true,
      messages: messages?.length ?? 0,
      comments: comments?.length ?? 0,
      enqueued,
    },
    { status: 200 },
  );
}
