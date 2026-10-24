import "server-only";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  lastInboundAt,
  resolveEventChannel,
  sendTextVia,
  WindowClosedError,
} from "@/lib/whatsapp/provider";

export interface WhatsappOutboundJob {
  messageId: string;
}

/**
 * Envia uma mensagem pendente pela Evolution API (ver .context/WHATSAPP_EVOLUTION.md).
 * Respeita consentimento antes de disparar; erros transitórios são relançados
 * para o BullMQ aplicar backoff exponencial.
 */
export async function handleWhatsappOutboundJob(data: WhatsappOutboundJob): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: message, error } = await admin
    .from("whatsapp_messages")
    .select("id,event_id,to_number_e164,body,status")
    .eq("id", data.messageId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`falha ao carregar mensagem: ${error.message}`);
  }

  if (message === null) {
    logger.warn({ messageId: data.messageId }, "mensagem não encontrada — job ignorado");
    return;
  }

  if (message.status !== "pending" && message.status !== "queued") {
    return;
  }

  const { data: consent } = await admin
    .from("consents")
    .select("status")
    .eq("phone_e164", message.to_number_e164)
    .eq("channel", "whatsapp")
    .maybeSingle();

  if (consent?.status !== "opted_in") {
    await admin
      .from("whatsapp_messages")
      .update({ status: "canceled", error: "sem consentimento do destinatário" })
      .eq("id", message.id);
    logger.info({ messageId: message.id }, "disparo cancelado: sem consentimento");
    return;
  }

  const channel =
    message.event_id === null ? "evolution" : await resolveEventChannel(message.event_id);
  let result: { externalMessageId?: string };
  try {
    result = await sendTextVia(channel, {
      instance: serverEnv().EVOLUTION_INSTANCE ?? "eventeia",
      to: message.to_number_e164,
      text: message.body,
      lastInboundAt: channel === "cloud" ? await lastInboundAt(message.to_number_e164) : null,
    });
  } catch (error) {
    if (!(error instanceof WindowClosedError)) throw error;
    await admin
      .from("whatsapp_messages")
      .update({ status: "canceled", error: "window_closed", channel })
      .eq("id", message.id);
    return;
  }

  await admin
    .from("whatsapp_messages")
    .update({
      status: "sent",
      channel,
      sent_at: new Date().toISOString(),
      external_message_id: result.externalMessageId ?? null,
    })
    .eq("id", message.id);
}

/** Marca a mensagem como falha definitiva após esgotar as tentativas. */
export async function markWhatsappMessageFailed(messageId: string, error: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("whatsapp_messages")
    .update({ status: "failed", failed_at: new Date().toISOString(), error: error.slice(0, 300) })
    .eq("id", messageId)
    .neq("status", "sent");
}
