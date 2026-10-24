import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";
import { getConnectionState } from "@/lib/evolution-api/client";
import { EvolutionNotConfiguredError, EvolutionSessionError } from "@/lib/evolution-api/client";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Saúde das instâncias WhatsApp (Regra 4 — retomada):
 * a cada 5 minutos verifica o connectionState de cada instância, atualiza o
 * status no banco e RETOMA a fila de prospecção quando a sessão volta.
 */
export async function runInstanceHealthSweep(): Promise<number> {
  const env = serverEnv();

  if (!isConfigured(env.EVOLUTION_API_KEY) || env.EVOLUTION_API_URL === undefined) {
    logger.info("saúde de instâncias ignorada: Evolution não configurada");
    return 0;
  }

  const admin = getSupabaseAdmin();
  const { data: instances, error } = await admin
    .from("whatsapp_instances")
    .select("id,instance_name,status")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error !== null) {
    throw new Error(`saúde de instâncias falhou: ${error.message}`);
  }

  const queue = getQueue(QUEUE_NAMES.quotationProspecting);
  const isPaused = (await queue.isPaused()) ?? false;
  let updated = 0;
  let anyConnected = false;

  for (const instance of instances ?? []) {
    try {
      const state = await getConnectionState(instance.instance_name);
      const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";

      if (state === "open") {
        anyConnected = true;
      }

      if (status !== instance.status) {
        await admin
          .from("whatsapp_instances")
          .update({ status, last_checked_at: new Date().toISOString() })
          .eq("id", instance.id);

        if (status === "connected" && instance.status === "disconnected") {
          try {
            await emitFeed(admin, {
              type: "whatsapp.instance_reconnected",
              actorType: "system",
              aggregateType: "whatsapp_instance",
              aggregateId: instance.instance_name,
              payload: { queue: QUEUE_NAMES.quotationProspecting },
              correlationId: `resume:${instance.instance_name}:${String(Date.now())}`,
              source: "worker",
            });
          } catch {
            // feed não bloqueia a retomada
          }
        }

        updated += 1;
      } else {
        await admin
          .from("whatsapp_instances")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", instance.id);
      }
    } catch (caught) {
      if (caught instanceof EvolutionNotConfiguredError) {
        return updated;
      }
      if (caught instanceof EvolutionSessionError) {
        // instância inexistente/expirada na Evolution: marca desconectada.
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected", last_checked_at: new Date().toISOString() })
          .eq("id", instance.id);
        updated += 1;
        continue;
      }
      logger.warn(
        { instance: instance.instance_name, reason: caught instanceof Error ? caught.message : "desconhecido" },
        "saúde: falha ao consultar instância",
      );
    }
  }

  if (isPaused && anyConnected) {
    await queue.resume();
    logger.info({ queue: queue.name }, "fila de prospecção retomada (sessão de volta)");
  }

  logger.info({ updated }, "varredura de saúde de instâncias concluída");
  return updated;
}
