"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveEventStage, PROCESS_STAGES, WHATSAPP_CHANNELS } from "@/lib/usage/stages";

const schema = z.object({
  eventId: z.string().uuid(),
  stage: z.enum(PROCESS_STAGES).optional(),
  channel: z.enum(WHATSAPP_CHANNELS).optional(),
});

/** Admin marca que o cliente fechou direto com o fornecedor (estágio/canal padrão = os atuais do evento). */
export async function markClosedOutsideAction(form: FormData): Promise<void> {
  await requireAdmin();
  const parsed = schema.safeParse({
    eventId: form.get("eventId"),
    stage: form.get("stage") || undefined,
    channel: form.get("channel") || undefined,
  });
  if (!parsed.success) return;
  const { data: ev } = await getSupabaseAdmin()
    .from("events")
    .select("status,interview_completed_at,discovery_started_at,collection_ended_at,quotes_delivered_at,whatsapp_channel")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (ev === null) return;
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("event_outcomes").upsert(
    {
      event_id: parsed.data.eventId,
      closed_outside: true,
      closed_outside_at: now,
      closed_outside_stage: parsed.data.stage ?? deriveEventStage(ev),
      whatsapp_channel: parsed.data.channel ?? ev.whatsapp_channel,
      source: "admin",
      updated_at: now,
    },
    { onConflict: "event_id" },
  );
  if (error !== null) logger.warn({ code: error.code }, "falha ao marcar fechamento por fora");
  revalidatePath("/admin/consumo");
}
