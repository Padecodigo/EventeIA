"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { cancelEventFollowUp } from "@/lib/events/cancel";
import {
  BULK_CLEAR_CONFIRMATION,
  canCancelEvent,
  isBulkClearConfirmed,
} from "@/lib/events/lifecycle";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface AdminEventActionState {
  error?: string;
  success?: string;
}

const eventIdSchema = z.object({ eventId: z.string().uuid() });

/** Teto por execução: a limpeza é operação de painel, não de lote infinito. */
const BULK_LIMIT = 200;

function revalidateEvents() {
  revalidatePath("/admin/eventos");
  revalidatePath("/admin/clientes");
  revalidatePath("/painel");
}

/**
 * Exclui um evento pelo painel admin (soft delete: status = canceled).
 *
 * Nunca há DELETE físico: o evento sai das listas, os disparos param e o
 * histórico financeiro (pagamentos, cotações) continua consultável.
 */
export async function deleteEventAction(
  _previous: AdminEventActionState,
  formData: FormData,
): Promise<AdminEventActionState> {
  const adminUser = await requireAdmin();

  const parsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const admin = getSupabaseAdmin();
  const { data: event, error: loadError } = await admin
    .from("events")
    .select("id,status,owner_profile_id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (loadError !== null) {
    logger.error({ code: loadError.code }, "falha ao carregar evento para exclusão");
    return { error: "Não foi possível excluir o evento." };
  }
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (!canCancelEvent(event.status)) {
    return { error: "Este evento já foi excluído." };
  }

  const { data: updated, error } = await admin
    .from("events")
    .update({ status: "canceled" })
    .eq("id", event.id)
    .neq("status", "canceled")
    .select("id");

  if (error !== null || updated === null || updated.length === 0) {
    logger.error({ code: error?.code }, "falha ao excluir evento pelo admin");
    return { error: "Não foi possível excluir o evento." };
  }

  await cancelEventFollowUp({
    eventId: event.id,
    ownerProfileId: event.owner_profile_id,
    actorId: adminUser.id,
    actorType: "admin",
  });

  revalidateEvents();
  return { success: "Evento excluído." };
}

/**
 * Limpa a lista: exclui (soft delete) todos os eventos que ainda não estão
 * cancelados — rascunhos, aguardando pagamento e ativos.
 *
 * É um UPDATE filtrado (`status <> 'canceled'`), jamais um DELETE sem WHERE: o
 * histórico continua auditável e cada evento mantém seus pagamentos. A
 * confirmação digitada existe porque a ação atinge vários clientes de uma vez.
 */
export async function clearEventsAction(
  _previous: AdminEventActionState,
  formData: FormData,
): Promise<AdminEventActionState> {
  const adminUser = await requireAdmin();

  if (!isBulkClearConfirmed(formData.get("confirm"))) {
    return { error: `Digite ${BULK_CLEAR_CONFIRMATION} para confirmar.` };
  }

  const admin = getSupabaseAdmin();
  const { data: events, error: listError } = await admin
    .from("events")
    .select("id,owner_profile_id")
    .neq("status", "canceled")
    .limit(BULK_LIMIT);

  if (listError !== null) {
    logger.error({ code: listError.code }, "falha ao listar eventos para limpeza");
    return { error: "Não foi possível listar os eventos." };
  }
  if (events === null || events.length === 0) {
    return { success: "Nenhum evento para limpar." };
  }

  let canceled = 0;
  let failed = 0;

  for (const event of events) {
    const { data: updated, error } = await admin
      .from("events")
      .update({ status: "canceled" })
      .eq("id", event.id)
      .neq("status", "canceled")
      .select("id");

    if (error !== null || updated === null || updated.length === 0) {
      failed += 1;
      logger.error({ code: error?.code, eventId: event.id }, "falha ao limpar evento");
      continue;
    }

    await cancelEventFollowUp({
      eventId: event.id,
      ownerProfileId: event.owner_profile_id,
      actorId: adminUser.id,
      actorType: "admin",
    });
    canceled += 1;
  }

  revalidateEvents();

  const suffix = events.length >= BULK_LIMIT ? ` (limite de ${String(BULK_LIMIT)} por execução)` : "";
  if (failed > 0) {
    return {
      error: `${String(canceled)} evento(s) excluído(s) e ${String(failed)} com falha.${suffix}`,
    };
  }
  return { success: `${String(canceled)} evento(s) excluído(s).${suffix}` };
}
