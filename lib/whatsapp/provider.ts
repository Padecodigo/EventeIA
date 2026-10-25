import "server-only";

import { serverEnv } from "@/lib/env";
import {
  sendFirstContact as evolutionFirstContact,
  sendText as evolutionText,
} from "@/lib/evolution-api/client";
import { meterUsage } from "@/lib/finance/metering";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isCloudConfigured,
  isWithinServiceWindow,
  resolveWhatsappChannel,
  type WhatsappChannel,
} from "@/lib/whatsapp/channel";
import { sendCloudFirstContactTemplate, sendCloudText } from "@/lib/whatsapp/cloud/client";

/**
 * Interface única de envio WhatsApp, agnóstica de canal.
 * - cloud: primeiro contato SEMPRE por template aprovado; texto livre só na janela de 24h.
 * - evolution: comportamento anterior (texto puro pela instância do cliente).
 */
export interface SendResult {
  channel: WhatsappChannel;
  externalMessageId?: string;
}

export class WindowClosedError extends Error {
  constructor() {
    super("Janela de 24h da Cloud API fechada: texto livre não permitido.");
    this.name = "WindowClosedError";
  }
}

export async function sendFirstContactVia(
  channel: WhatsappChannel,
  input: { instance: string; to: string; text: string },
): Promise<SendResult> {
  if (channel === "cloud") {
    const r = await sendCloudFirstContactTemplate(input.to, input.text);
    meterUsage("whatsapp_cloud", "first_contact");
    return { channel, ...r };
  }
  const r = await evolutionFirstContact(input.instance, { number: input.to, text: input.text });
  meterUsage("evolution", "first_contact");
  return { channel, ...r };
}

export async function sendTextVia(
  channel: WhatsappChannel,
  input: { instance: string; to: string; text: string; lastInboundAt: string | null; now?: Date },
): Promise<SendResult> {
  if (channel === "cloud") {
    if (!isWithinServiceWindow(input.lastInboundAt, input.now ?? new Date())) {
      throw new WindowClosedError();
    }
    const r = await sendCloudText(input.to, input.text);
    meterUsage("whatsapp_cloud", "text");
    return { channel, ...r };
  }
  const r = await evolutionText(input.instance, input.to, input.text);
  meterUsage("evolution", "text");
  return { channel, ...r };
}

/** Canal efetivo do evento: evento → cliente (dono) → padrão. */
export async function resolveEventChannel(eventId: string): Promise<WhatsappChannel> {
  const admin = getSupabaseAdmin();
  const { data: ev } = await admin
    .from("events")
    .select("whatsapp_channel,owner_profile_id")
    .eq("id", eventId)
    .maybeSingle();
  let profileChannel: string | null = null;
  if (ev !== null && ev.whatsapp_channel === null) {
    const { data: prof } = await admin
      .from("profiles")
      .select("whatsapp_channel")
      .eq("id", ev.owner_profile_id)
      .maybeSingle();
    profileChannel = prof?.whatsapp_channel ?? null;
  }
  return resolveWhatsappChannel({
    eventChannel: ev?.whatsapp_channel ?? null,
    profileChannel,
    cloudConfigured: isCloudConfigured(serverEnv()),
  });
}

/** Última mensagem recebida do número (para a janela de 24h). */
export async function lastInboundAt(phoneE164: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_messages")
    .select("created_at")
    .eq("to_number_e164", phoneE164)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}
