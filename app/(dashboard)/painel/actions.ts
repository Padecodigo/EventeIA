"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { cancelEventFollowUp } from "@/lib/events/cancel";
import {
  BULK_CLEAR_CONFIRMATION,
  canCancelEvent,
  isBulkClearConfirmed,
} from "@/lib/events/lifecycle";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PanelEventState {
  error?: string;
  success?: string;
}

/** Teto por execução da limpeza no painel do usuário. */
const BULK_LIMIT = 200;

function revalidatePanel() {
  revalidatePath("/painel");
  revalidatePath("/eventos");
}

/**
 * Exclui um evento do próprio painel (soft delete: status = canceled).
 *
 * Roda com o client do usuário: a RLS garante que ele só alcança os próprios
 * eventos (ou os do workspace em que pode editar). Nada é apagado do banco —
 * o histórico financeiro continua auditável.
 */
export async function cancelOwnEventAction(
  _previous: PanelEventState,
  formData: FormData,
): Promise<PanelEventState> {
  const user = await requireUser();

  const parsed = z
    .object({ eventId: z.string().uuid() })
    .safeParse({ eventId: formData.get("eventId") });

  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,status,owner_profile_id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (!canCancelEvent(event.status)) {
    return { error: "Este evento já foi excluído." };
  }

  const { data: updated, error } = await supabase
    .from("events")
    .update({ status: "canceled" })
    .eq("id", event.id)
    .neq("status", "canceled")
    .select("id");

  if (error !== null || updated === null || updated.length === 0) {
    logger.error({ code: error?.code }, "falha ao excluir evento pelo painel");
    return { error: "Não foi possível excluir o evento." };
  }

  await cancelEventFollowUp({
    eventId: event.id,
    ownerProfileId: event.owner_profile_id,
    actorId: user.id,
    actorType: "user",
  });

  revalidatePanel();
  revalidatePath(`/eventos/${event.id}`);
  return { success: "Evento excluído." };
}

/**
 * Limpa o painel: exclui (soft delete) todos os eventos visíveis ao usuário que
 * ainda não estão cancelados.
 *
 * É UPDATE filtrado sob RLS — nunca DELETE sem WHERE. A confirmação digitada
 * existe porque a ação atinge todos os eventos de uma vez.
 */
export async function clearOwnEventsAction(
  _previous: PanelEventState,
  formData: FormData,
): Promise<PanelEventState> {
  const user = await requireUser();

  if (!isBulkClearConfirmed(formData.get("confirm"))) {
    return { error: `Digite ${BULK_CLEAR_CONFIRMATION} para confirmar.` };
  }

  const supabase = await createSupabaseServerClient();
  const { data: events, error: listError } = await supabase
    .from("events")
    .select("id,owner_profile_id")
    .neq("status", "canceled")
    .limit(BULK_LIMIT);

  if (listError !== null) {
    logger.error({ code: listError.code }, "falha ao listar eventos do painel");
    return { error: "Não foi possível listar os eventos." };
  }
  if (events === null || events.length === 0) {
    return { success: "Nenhum evento para excluir." };
  }

  let canceled = 0;
  let failed = 0;

  for (const event of events) {
    const { data: updated, error } = await supabase
      .from("events")
      .update({ status: "canceled" })
      .eq("id", event.id)
      .neq("status", "canceled")
      .select("id");

    if (error !== null || updated === null || updated.length === 0) {
      failed += 1;
      logger.error({ code: error?.code, eventId: event.id }, "falha ao limpar evento do painel");
      continue;
    }

    await cancelEventFollowUp({
      eventId: event.id,
      ownerProfileId: event.owner_profile_id,
      actorId: user.id,
      actorType: "user",
    });
    canceled += 1;
  }

  revalidatePanel();

  const suffix = events.length >= BULK_LIMIT ? ` (limite de ${String(BULK_LIMIT)} por execução)` : "";
  if (failed > 0) {
    return { error: `${String(canceled)} evento(s) excluído(s) e ${String(failed)} com falha.${suffix}` };
  }
  return { success: `${String(canceled)} evento(s) excluído(s).${suffix}` };
}
