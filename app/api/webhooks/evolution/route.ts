import { NextResponse } from "next/server";

import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { readEvolutionWebhookToken, verifyEvolutionWebhookToken } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { processInboundEvents, type InboundEvent } from "@/lib/whatsapp/inbound";
import { activateSession, handleSessionLost } from "@/lib/whatsapp/session-manager";
import { createSessionDeps } from "@/lib/whatsapp/session-runtime";

export const runtime = "nodejs";

const dataSchema = z
  .object({
    key: z
      .object({
        id: z.string().optional(),
        remoteJid: z.string().optional(),
        fromMe: z.boolean().optional(),
      })
      .optional(),
    status: z.string().optional(),
    state: z.string().optional(),
    message: z
      .object({
        conversation: z.string().optional(),
        extendedTextMessage: z.object({ text: z.string().optional() }).optional(),
      })
      .optional(),
  })
  .passthrough();

const bodySchema = z
  .object({
    event: z.string().min(1),
    instance: z.string().optional(),
    data: dataSchema.optional(),
  })
  .passthrough();

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  ERROR: "failed",
  FAILED: "failed",
};

function digitsToE164(remoteJid: string | undefined): string | null {
  if (remoteJid === undefined) {
    return null;
  }
  const digits = remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? `+${digits}` : null;
}

/**
 * Webhook da Evolution API: status de entrega, respostas e opt-out ("SAIR").
 * Ver .context/WHATSAPP_EVOLUTION.md §6.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { token, via } = readEvolutionWebhookToken(request.headers, url);

  if (!verifyEvolutionWebhookToken(token)) {
    logger.warn({ via }, "webhook evolution rejeitado (token)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const payload = parsed.data;
  const data = payload.data;
  const messageId = data?.key?.id;
  const externalEventId = `${payload.event}:${messageId ?? crypto.randomUUID()}`;

  try {
    const admin = getSupabaseAdmin();

    const { data: inserted, error } = await admin
      .from("webhook_events")
      .upsert(
        {
          source: "evolution",
          external_event_id: externalEventId,
          payload: payload as unknown as Json,
          status: "received",
        },
        { onConflict: "source,external_event_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (error !== null) {
      logger.error({ code: error.code }, "falha ao registrar webhook evolution");
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }

    if (inserted === null) {
      return NextResponse.json({ ok: true, duplicated: true });
    }

    const status = data?.status === undefined ? undefined : STATUS_MAP[data.status.toUpperCase()];
    const events: InboundEvent[] = [];
    if (
      payload.event.startsWith("messages.update") &&
      messageId !== undefined &&
      status !== undefined
    ) {
      events.push({ kind: "status", messageId, status });
    }
    if (payload.event.startsWith("messages.upsert") && data?.key?.fromMe !== true) {
      const phone = digitsToE164(data?.key?.remoteJid);
      const text = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text ?? null;
      if (phone !== null && text !== null) {
        events.push({ kind: "message", messageId, phone, text });
      }
    }
    await processInboundEvents(admin, events, {
      channel: "evolution",
      correlationId: externalEventId,
    });

    // Ciclo de vida da sessão efêmera: open ⇒ active (inicia janela); close ⇒ perdida.
    const normalizedEvent = payload.event.toLowerCase().replace(/_/g, ".");
    if (normalizedEvent.startsWith("connection.update") && payload.instance !== undefined) {
      const { data: instanceRow } = await admin
        .from("whatsapp_instances")
        .select("event_id")
        .eq("instance_name", payload.instance)
        .maybeSingle();
      const eventId = instanceRow?.event_id ?? null;

      if (eventId !== null) {
        const deps = createSessionDeps();
        if (data?.state === "open") {
          await activateSession(deps, {
            instance: payload.instance,
            eventId,
            windowMinutes: serverEnv().WHATSAPP_COLLECTION_WINDOW_MINUTES,
          });
        } else if (data?.state === "close") {
          await handleSessionLost(deps, { instance: payload.instance, eventId });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "erro inesperado no webhook evolution",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
