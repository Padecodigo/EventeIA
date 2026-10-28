"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { cancelEventFollowUp } from "@/lib/events/cancel";
import { canCancelEvent, canCompleteEvent } from "@/lib/events/lifecycle";
import { stopEventBackgroundWork } from "@/lib/events/stop";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EventLifecycleState {
  error?: string;
}

const eventIdSchema = z.object({ eventId: z.string().uuid() });

/** Carrega o evento com o client do usuário: a RLS garante a posse/workspace. */
async function loadEventForAction(eventId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("events")
    .select("id,status,owner_profile_id")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}

/**
 * Encerra o evento (active → completed). Finaliza a coleta em andamento,
 * entrega os cenários já cotados e para os disparos de fornecedores.
 */
export async function completeEventAction(
  _previous: EventLifecycleState,
  formData: FormData,
): Promise<EventLifecycleState> {
  const user = await requireUser();
  const parsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const event = await loadEventForAction(parsed.data.eventId);
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (!canCompleteEvent(event.status)) {
    return { error: "Só é possível encerrar um evento ativo." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("events")
    .update({ status: "completed" })
    .eq("id", event.id)
    .eq("status", "active")
    .select("id");

  if (error !== null || updated === null || updated.length === 0) {
    logger.error({ code: error?.code }, "falha ao encerrar evento");
    return { error: "Não foi possível encerrar o evento. Tente novamente." };
  }

  await stopEventBackgroundWork(event.id);

  try {
    // Fase 4 idempotente: congela os três cenários com o que já foi cotado.
  } catch (caught) {
    logger.warn(
      { eventId: event.id, reason: caught instanceof Error ? caught.message : "desconhecido" },
      "entrega das cotações no encerramento falhou",
    );
  }

  try {
    await emitFeed(getSupabaseAdmin(), {
      type: "event.completed",
      actorType: "user",
      actorId: user.id,
      aggregateType: "event",
      aggregateId: event.id,
      payload: {},
      correlationId: event.id,
      source: "app",
    });
  } catch {
    // feed não bloqueia o encerramento
  }

  revalidatePath("/eventos");
  revalidatePath("/painel");
  revalidatePath(`/eventos/${event.id}`);
  return {};
}

/**
 * Exclui o evento (soft delete: status = canceled, nunca DELETE físico —
 * .context/DATABASE_RLS.md). Remove da lista, para os disparos em andamento
 * e descarta os jobs de fim da coleta de um evento que não existe mais.
 */
export async function cancelEventAction(
  _previous: EventLifecycleState,
  formData: FormData,
): Promise<EventLifecycleState> {
  const user = await requireUser();
  const parsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const event = await loadEventForAction(parsed.data.eventId);
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (!canCancelEvent(event.status)) {
    return { error: "Este evento já foi excluído." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("events")
    .update({ status: "canceled" })
    .eq("id", event.id)
    .eq("status", event.status)
    .select("id");

  if (error !== null || updated === null || updated.length === 0) {
    logger.error({ code: error?.code }, "falha ao excluir evento");
    return { error: "Não foi possível excluir o evento. Tente novamente." };
  }

  await cancelEventFollowUp({
    eventId: event.id,
    ownerProfileId: event.owner_profile_id,
    actorId: user.id,
    actorType: "user",
  });

  revalidatePath("/eventos");
  revalidatePath("/painel");
  redirect("/eventos");
}
