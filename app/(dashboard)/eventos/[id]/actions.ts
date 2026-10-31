"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { isEventStarted, STARTED_EVENT_LOCK_MESSAGE } from "@/lib/events/edit-lock";

import { requireUser } from "@/lib/auth";
import { EVENT_STYLES, SPACE_TYPES } from "@/lib/catalog/v1";
import { parseBudgetLimitInput } from "@/lib/events/budget-limit";
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

export interface EventDetailsState {
  error?: string;
  saved?: boolean;
}

const eventDetailsSchema = z.object({
  eventId: z.string().uuid(),
  guestCount: z.coerce.number().int().min(1).max(5000),
  venueCapacity: z.string().trim().max(10).optional(),
  venueType: z.string().trim().max(40).optional(),
  eventStyle: z.string().trim().max(40).optional(),
});

function optionalEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null | "invalid" {
  const value = raw === undefined || raw === "" ? null : raw;
  if (value === null) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : "invalid";
}

/**
 * Edita dados básicos do evento (convidados, local e estilo) depois da criação.
 * A capacidade não bloqueia o salvamento: a página avisa quando o local é pequeno.
 */
export async function updateEventDetailsAction(
  _previous: EventDetailsState,
  formData: FormData,
): Promise<EventDetailsState> {
  await requireUser();
  const parsed = eventDetailsSchema.safeParse({
    eventId: formData.get("eventId"),
    guestCount: formData.get("guestCount"),
    venueCapacity: formData.get("venueCapacity") ?? undefined,
    venueType: formData.get("venueType") ?? undefined,
    eventStyle: formData.get("eventStyle") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Informe um número de convidados entre 1 e 5.000." };
  }

  const capacityRaw = parsed.data.venueCapacity ?? "";
  const venueCapacity = capacityRaw === "" ? null : Number(capacityRaw);
  if (
    venueCapacity !== null &&
    (!Number.isInteger(venueCapacity) || venueCapacity < 1 || venueCapacity > 100_000)
  ) {
    return { error: "Informe a capacidade do local em convidados (maior que zero)." };
  }

  const venueType = optionalEnum(parsed.data.venueType, SPACE_TYPES);
  if (venueType === "invalid") {
    return { error: "Escolha um tipo de local válido." };
  }
  const eventStyle = optionalEnum(parsed.data.eventStyle, EVENT_STYLES);
  if (eventStyle === "invalid") {
    return { error: "Escolha um estilo válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,status,discovery_started_at,interview_completed_at")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (event.status === "canceled") {
    return { error: "Um evento excluído não pode ser editado." };
  }
  if (isEventStarted(event)) {
    return { error: STARTED_EVENT_LOCK_MESSAGE };
  }

  const { data: updated, error } = await supabase
    .from("events")
    .update({
      guest_count: parsed.data.guestCount,
      venue_capacity: venueCapacity,
      venue_type: venueType,
      event_style: eventStyle,
    })
    .eq("id", event.id)
    .select("id");

  if (error !== null || updated === null || updated.length === 0) {
    logger.error({ code: error?.code }, "falha ao editar dados do evento");
    return { error: "Não foi possível salvar os dados do evento. Tente novamente." };
  }

  revalidatePath(`/eventos/${event.id}`);
  revalidatePath("/eventos");
  revalidatePath("/painel");
  return { saved: true };
}

export interface BudgetLimitState {
  error?: string;
  saved?: boolean;
}

/**
 * Edita o orçamento limite do evento (0072). Só dono ou admin: a RPC
 * `set_event_budget_limit` valida a posse e o trigger grava o histórico.
 * Vazio = remover o limite.
 */
export async function updateBudgetLimitAction(
  _previous: BudgetLimitState,
  formData: FormData,
): Promise<BudgetLimitState> {
  await requireUser();
  const idParsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!idParsed.success) return { error: "Evento não encontrado." };
  const limit = parseBudgetLimitInput(formData.get("budgetLimit"));
  if (!limit.ok) return { error: limit.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_event_budget_limit", {
    p_event_id: idParsed.data.eventId,
    p_cents: limit.cents,
  });
  if (error !== null) {
    if (error.code === "42501") {
      return { error: "Só o dono do evento pode alterar o orçamento limite (eventos encerrados não aceitam mudanças)." };
    }
    logger.error({ code: error.code }, "falha ao editar orçamento limite");
    return { error: "Não foi possível salvar o orçamento limite. Tente novamente." };
  }

  revalidatePath(`/eventos/${idParsed.data.eventId}`);
  return { saved: true };
}
