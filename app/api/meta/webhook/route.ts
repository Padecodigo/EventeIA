import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyChallenge, verifyHubSignature } from "@/lib/meta/signature";
import { parseMetaWebhook } from "@/lib/meta/webhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Webhook único do Meta (Instagram + Messenger).
 *
 * Verifica a assinatura, normaliza as mensagens e as persiste em
 * `webhook_events` (dedup por source + external_event_id). O encaminhamento para
 * o pipeline de interpretação (DeepSeek V4 Flash) entra na etapa seguinte.
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

/** Recebe mensagens do Instagram/Messenger, valida a assinatura e persiste. */
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

  const messages = parseMetaWebhook(json);
  if (messages === null) {
    // echo/read/delivery ou payload não reconhecido: confirma recebimento e ignora.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const admin = getSupabaseAdmin();
  let persisted = 0;
  for (const message of messages) {
    const { data: inserted, error } = await admin
      .from("webhook_events")
      .upsert(
        {
          // A migração 0052 relaxa o CHECK para incluir 'meta'; os tipos gerados
          // (`supabase gen types`) ainda não foram regenerados, então o cast é
          // temporário até o banco receber a 0052 e os tipos serem re-gerados.
          source: "meta" as unknown as "whatsapp_cloud",
          external_event_id: message.eventId,
          payload: message as unknown as Json,
          status: "received",
        },
        { onConflict: "source,external_event_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error !== null) {
      logger.error({ code: error.code }, "falha ao persistir webhook meta");
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }
    if (inserted !== null) persisted += 1;
  }

  logger.info({ received: messages.length, persisted }, "webhook meta: mensagens persistidas");
  return NextResponse.json({ received: true, count: messages.length }, { status: 200 });
}
