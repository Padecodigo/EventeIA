"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lastInboundAt, resolveEventChannel, sendTextVia, WindowClosedError } from "@/lib/whatsapp/provider";

export interface ProspectReplyState {
  error?: string;
  sent?: boolean;
  dismissed?: boolean;
}

const replySchema = z.object({
  eventId: z.string().uuid(),
  prospectId: z.string().uuid(),
  reply: z.string().trim().min(2).max(600),
});

const dismissSchema = z.object({
  eventId: z.string().uuid(),
  prospectId: z.string().uuid(),
});

async function loadProspect(eventId: string, prospectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,owner_profile_id,status")
    .eq("id", eventId)
    .maybeSingle();
  if (event === null) return null;
  const { data: prospect } = await supabase
    .from("vendor_prospects")
    .select("id,event_id,phone_e164,status,pending_reply,dry_run")
    .eq("id", prospectId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (prospect === null) return null;
  return { event, prospect };
}

/**
 * Envia a resposta que a IA redigiu (revisada/editada pelo usuário) ao fornecedor.
 * O envio usa o canal do evento (Cloud API oficial ou Evolution).
 */
export async function sendProspectReplyAction(
  _previous: ProspectReplyState,
  formData: FormData,
): Promise<ProspectReplyState> {
  const user = await requireUser();
  const parsed = replySchema.safeParse({
    eventId: formData.get("eventId"),
    prospectId: formData.get("prospectId"),
    reply: formData.get("reply"),
  });
  if (!parsed.success) {
    return { error: "Escreva uma resposta válida (até 600 caracteres)." };
  }

  const loaded = await loadProspect(parsed.data.eventId, parsed.data.prospectId);
  if (loaded === null) {
    return { error: "Fornecedor não encontrado." };
  }
  const { event, prospect } = loaded;
  if (event.status === "canceled") {
    return { error: "Este evento foi excluído." };
  }
  if (prospect.status === "opt_out") {
    return { error: "Este fornecedor pediu para não receber mensagens." };
  }
  if (prospect.dry_run) {
    return { error: "Fornecedor de simulação (dry-run): envio bloqueado." };
  }

  const text = parsed.data.reply
    .replace(/(https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  if (text.length < 2) {
    return { error: "Resposta vazia." };
  }

  const admin = getSupabaseAdmin();
  try {
    const channel = await resolveEventChannel(event.id);
    const sent = await sendTextVia(channel, {
      instance: `eventeia-${event.owner_profile_id.slice(0, 8)}`,
      to: prospect.phone_e164,
      text,
      eventId: event.id,
      lastInboundAt: channel === "cloud" ? await lastInboundAt(prospect.phone_e164) : null,
    });

    await admin.from("whatsapp_messages").upsert(
      {
        event_id: event.id,
        prospect_id: prospect.id,
        direction: "outbound",
        template: "supplier_reply",
        channel,
        to_number_e164: prospect.phone_e164,
        body: text,
        status: "sent",
        sent_at: new Date().toISOString(),
        external_message_id: sent.externalMessageId ?? null,
        idempotency_key: `reply:${prospect.id}:${crypto.randomUUID()}`,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );

    await admin
      .from("vendor_prospects")
      .update({
        pending_reply: null,
        pending_reply_kind: null,
        pending_reply_at: null,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    try {
      await emitFeed(admin, {
        type: "vendor.replied",
        actorType: "user",
        actorId: user.id,
        aggregateType: "vendor_prospect",
        aggregateId: prospect.id,
        payload: { event_id: event.id },
        correlationId: prospect.id,
        source: "app",
      });
    } catch {
      // feed não bloqueia o envio
    }

    revalidatePath(`/eventos/${event.id}`);
    return { sent: true };
  } catch (caught) {
    if (caught instanceof WindowClosedError) {
      return {
        error:
          "A janela de 24h do WhatsApp oficial fechou — não é possível responder agora. A resposta continua salva.",
      };
    }
    logger.warn(
      { prospectId: prospect.id, reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao enviar resposta aprovada ao fornecedor",
    );
    return { error: "Não foi possível enviar agora. A resposta continua salva para tentar de novo." };
  }
}

/** Descarta a resposta pendente (não envia nada). */
export async function dismissProspectReplyAction(
  _previous: ProspectReplyState,
  formData: FormData,
): Promise<ProspectReplyState> {
  await requireUser();
  const parsed = dismissSchema.safeParse({
    eventId: formData.get("eventId"),
    prospectId: formData.get("prospectId"),
  });
  if (!parsed.success) {
    return { error: "Fornecedor inválido." };
  }

  const loaded = await loadProspect(parsed.data.eventId, parsed.data.prospectId);
  if (loaded === null) {
    return { error: "Fornecedor não encontrado." };
  }

  const { error } = await getSupabaseAdmin()
    .from("vendor_prospects")
    .update({ pending_reply: null, pending_reply_kind: null, pending_reply_at: null })
    .eq("id", loaded.prospect.id);
  if (error !== null) {
    logger.error({ code: error.code }, "falha ao descartar resposta pendente");
    return { error: "Não foi possível descartar agora." };
  }

  revalidatePath(`/eventos/${parsed.data.eventId}`);
  return { dismissed: true };
}
