import "server-only";

import { serverEnv } from "@/lib/env";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isEligibleForInvite } from "@/lib/testimonials/pure";
import { renderTestimonialInvite } from "@/lib/whatsapp/templates";

const MAX_EVENTS_PER_RUN = 100;
const MAX_DAYS_AFTER_EVENT = 30;

function isoDateInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function daysAgoIso(todayIso: string, days: number): string {
  const time = Date.parse(`${todayIso}T00:00:00Z`) - days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Varredura diária: eventos que aconteceram ontem (até 30 dias) recebem um
 * convite de depoimento por WhatsApp — somente se houver consentimento opt-in.
 * A mensagem entra na fila `whatsapp-outbound`; nada é enviado direto aqui.
 */
export async function runTestimonialInviteSweep(): Promise<number> {
  const admin = getSupabaseAdmin();
  const todayIso = isoDateInSaoPaulo(new Date());
  const cutoffIso = daysAgoIso(todayIso, MAX_DAYS_AFTER_EVENT);

  const { data: events, error } = await admin
    .from("events")
    .select("id,title,event_date,status,owner_profile_id")
    .in("status", ["active", "completed"])
    .gte("event_date", cutoffIso)
    .lte("event_date", todayIso)
    .order("event_date", { ascending: false })
    .limit(MAX_EVENTS_PER_RUN);

  if (error !== null) {
    throw new Error(`varredura de convites falhou: ${error.message}`);
  }

  let sent = 0;

  for (const event of events ?? []) {
    if (!isEligibleForInvite({ event_date: event.event_date, status: event.status }, todayIso)) {
      continue;
    }

    try {
      const { data: existingInvite } = await admin
        .from("testimonial_invites")
        .select("id")
        .eq("event_id", event.id)
        .limit(1)
        .maybeSingle();

      if (existingInvite !== null) {
        continue;
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name,phone_e164")
        .eq("id", event.owner_profile_id)
        .maybeSingle();

      if (profile === null || profile.phone_e164 === null) {
        continue;
      }

      const { data: consent } = await admin
        .from("consents")
        .select("status")
        .eq("phone_e164", profile.phone_e164)
        .eq("channel", "whatsapp")
        .maybeSingle();

      if (consent?.status !== "opted_in") {
        continue;
      }

      const { data: invite, error: inviteError } = await admin
        .from("testimonial_invites")
        .insert({ event_id: event.id, profile_id: event.owner_profile_id })
        .select("id,token,expires_at")
        .single();

      if (inviteError !== null || invite === null) {
        logger.warn({ eventId: event.id }, "não foi possível criar convite automático");
        continue;
      }

      const baseUrl = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
      const firstName = profile.display_name.trim().split(/\s+/)[0] ?? "";
      const body = renderTestimonialInvite({
        recipientName: firstName.length > 0 ? firstName : profile.display_name,
        eventTitle: event.title,
        link: `${baseUrl}/depoimento?token=${invite.token}`,
      });

      const { data: message, error: messageError } = await admin
        .from("whatsapp_messages")
        .upsert(
          {
            event_id: event.id,
            direction: "outbound",
            template: "testimonial_invite",
            to_number_e164: profile.phone_e164,
            body,
            status: "pending",
            idempotency_key: `testimonial_invite:event:${event.id}`,
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();

      if (messageError !== null || message === null) {
        continue;
      }

      await getQueue(QUEUE_NAMES.whatsappOutbound).add(
        "send",
        { messageId: message.id },
        { jobId: `testimonial_invite:${event.id}` },
      );

      try {
        await emitFeed(admin, {
          type: "testimonial.invited",
          actorType: "system",
          aggregateType: "event",
          aggregateId: event.id,
          payload: { channel: "whatsapp", invite_expires_at: invite.expires_at },
          correlationId: invite.id,
          source: "worker",
        });
      } catch (feedError) {
        logger.warn(
          { reason: feedError instanceof Error ? feedError.message : "desconhecido" },
          "feed testimonial.invited falhou",
        );
      }

      sent += 1;
    } catch (caught) {
      logger.error(
        { eventId: event.id, reason: caught instanceof Error ? caught.message : "desconhecido" },
        "erro ao convidar para depoimento",
      );
    }
  }

  logger.info({ sent, todayIso }, "varredura de convites de depoimento concluída");
  return sent;
}
