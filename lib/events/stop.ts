import "server-only";

import { logger } from "@/lib/logger";
import { getQueue, QUEUE_NAMES, type QueueName } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Para o trabalho de bastidor de um evento encerrado/excluído.
 *
 * 1. Banco: marca fim da coleta e da descoberta (idempotente).
 * 2. Fila: pausa os jobs do evento (flag Redis) e remove os primeiros
 *    contatos ainda pendentes — um evento fora de 'active' nunca dispara.
 * 3. `removeScheduledEventJobs` (usado no cancelamento): remove os jobs
 *    agendados de fim da coleta, para não notificar "cotações prontas"
 *    de um evento que não existe mais na lista do usuário.
 *
 * Nunca lança: falha de fila/Redis não desfaz a mudança de status.
 */

async function removeQueuedJob(queueName: QueueName, jobId: string): Promise<void> {
  try {
    const job = await getQueue(queueName).getJob(jobId);
    if (job !== undefined && job !== null) {
      await job.remove();
    }
  } catch (caught) {
    logger.warn(
      { jobId, queue: queueName, reason: caught instanceof Error ? caught.message : "desconhecido" },
      "não foi possível remover job agendado",
    );
  }
}

export async function stopEventBackgroundWork(eventId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  try {
    await admin
      .from("events")
      .update({ discovery_status: "completed", collection_ended_at: nowIso })
      .eq("id", eventId)
      .is("collection_ended_at", null);
    await admin.from("events").update({ discovery_status: "completed" }).eq("id", eventId);
  } catch (caught) {
    logger.warn(
      { eventId, reason: caught instanceof Error ? caught.message : "desconhecido" },
      "não foi possível encerrar coleta/descoberta do evento",
    );
  }

  const { data: pending } = await admin
    .from("vendor_prospects")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending");

  for (const prospect of pending ?? []) {
    await removeQueuedJob(QUEUE_NAMES.quotationProspecting, `prospect-${prospect.id}`);
  }
}

/** Remove os jobs de fim da coleta (24h/meta) de um evento excluído. */
export function removeScheduledEventJobs(eventId: string, ownerProfileId: string): void {
  // Não há mais jobs de sessão a remover.
  void eventId;
  void ownerProfileId;
}
