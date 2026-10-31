"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { isDeleteConfirmed } from "@/lib/events/history-deletion";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface HistoryDeletionState {
  error?: string;
  deleted?: number;
  undone?: boolean;
}

const scopeSchema = z.union([
  z.object({ scope: z.literal("all") }),
  z.object({ scope: z.literal("one"), eventId: z.string().uuid() }),
]);

/**
 * Apaga (soft delete) um evento encerrado ou todo o histórico encerrado.
 * Exige digitar APAGAR. Posse/estado são validados de novo na RPC (0074).
 */
export async function deleteEventHistoryAction(
  _previous: HistoryDeletionState,
  formData: FormData,
): Promise<HistoryDeletionState> {
  await requireUser();
  if (!isDeleteConfirmed(formData.get("confirmation"))) {
    return { error: "Digite APAGAR para confirmar." };
  }
  const parsed = scopeSchema.safeParse({
    scope: formData.get("scope"),
    eventId: formData.get("eventId") ?? undefined,
  });
  if (!parsed.success) return { error: "Escolha o que apagar." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_event_history_deletion", {
    p_event_ids: parsed.data.scope === "all" ? null : [parsed.data.eventId],
  });
  if (error !== null) {
    if (error.code === "42501") {
      return { error: "Só eventos encerrados podem ser apagados. Encerre ou exclua o evento antes." };
    }
    logger.error({ code: error.code }, "falha ao apagar histórico de eventos");
    return { error: "Não foi possível apagar agora. Tente novamente." };
  }

  revalidatePath("/perfil");
  revalidatePath("/eventos");
  revalidatePath("/painel");
  return { deleted: data ?? 0 };
}

const undoSchema = z.object({ eventId: z.string().uuid() });

/** Desfaz a exclusão dentro dos 30 dias. */
export async function undoEventDeletionAction(
  _previous: HistoryDeletionState,
  formData: FormData,
): Promise<HistoryDeletionState> {
  await requireUser();
  const parsed = undoSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return { error: "Evento não encontrado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("undo_event_history_deletion", {
    p_event_id: parsed.data.eventId,
  });
  if (error !== null) {
    return { error: "Não é mais possível desfazer esta exclusão." };
  }
  revalidatePath("/perfil");
  revalidatePath("/eventos");
  return { undone: true };
}
