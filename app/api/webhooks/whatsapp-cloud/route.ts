import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  cloudEventId,
  parseCloudWebhook,
  verifyCloudChallenge,
  verifyCloudSignature,
} from "@/lib/whatsapp/cloud/webhook";
import { processInboundEvents } from "@/lib/whatsapp/inbound";

export const runtime = "nodejs";

/** Verificação do webhook pela Meta (hub.challenge). */
export function GET(request: Request): NextResponse {
  const challenge = verifyCloudChallenge(
    new URL(request.url).searchParams,
    serverEnv().WHATSAPP_CLOUD_VERIFY_TOKEN,
  );
  if (challenge === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * Webhook da WhatsApp Cloud API: valida X-Hub-Signature-256 sobre o corpo bruto
 * e alimenta o MESMO pipeline de entrada da Evolution (lib/whatsapp/inbound.ts).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();
  if (
    !verifyCloudSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      serverEnv().WHATSAPP_CLOUD_APP_SECRET,
    )
  ) {
    logger.warn("webhook whatsapp-cloud rejeitado (assinatura)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = parseCloudWebhook(json);
  if (events === null) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    let processed = 0;
    for (const event of events) {
      const externalEventId = cloudEventId(event);
      const { data: inserted, error } = await admin
        .from("webhook_events")
        .upsert(
          {
            source: "whatsapp_cloud",
            external_event_id: externalEventId,
            payload: event as unknown as Json,
            status: "received",
          },
          { onConflict: "source,external_event_id", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error !== null) {
        logger.error({ code: error.code }, "falha ao registrar webhook whatsapp-cloud");
        return NextResponse.json({ error: "persist_failed" }, { status: 500 });
      }
      if (inserted === null) continue; // replay: já processado
      await processInboundEvents(admin, [event], {
        channel: "cloud",
        correlationId: externalEventId,
      });
      processed += 1;
    }
    return NextResponse.json({ ok: true, processed });
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "erro inesperado no webhook whatsapp-cloud",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
