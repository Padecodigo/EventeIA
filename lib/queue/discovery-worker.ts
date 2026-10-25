import "server-only";

import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";

import { createRouterUsageStore, getRouter } from "@/lib/ai/runtime";
import { runDiscoveryRound } from "@/lib/discovery/engine";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { createDiscoveryDeps, createRedisLlmUsage } from "@/lib/discovery/runtime";
import { serverEnv } from "@/lib/env";
import { meterUsage } from "@/lib/finance/metering";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES } from "@/lib/queue";
import { msUntilSearchStart } from "@/lib/search-start";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const discoveryJobSchema = z.object({ eventId: z.string().uuid(), round: z.number().int().min(0).max(1000) });

/**
 * Descoberta só em dia útil brasileiro (seg–sex, sem feriados nacionais), 9h–18h de Brasília.
 * Fora da janela o job é ADIADO (BullMQ delayed) para a próxima abertura — nunca descartado.
 * Se o cliente agendou `search_start_date`, adia até a janela comercial desse dia.
 * Retorna true quando adiou (o chamador deve lançar DelayedError).
 */
export async function deferOutsideBusinessWindow(
  job: Pick<Job, "moveToDelayed">,
  token: string | undefined,
  now: Date = new Date(),
  searchStartDate: string | null = null,
): Promise<boolean> {
  const wait = msUntilSearchStart(now, searchStartDate);
  if (wait <= 0) return false;
  await job.moveToDelayed(now.getTime() + wait, token);
  return true;
}

/** Data agendada pelo cliente (null = o quanto antes). Falha de leitura não bloqueia: segue o gating padrão. */
export async function loadSearchStartDate(eventId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("events").select("search_start_date").eq("id", eventId).maybeSingle();
  if (error !== null) {
    logger.warn({ eventId, code: error.code }, "falha ao ler search_start_date");
    return null;
  }
  return data?.search_start_date ?? null;
}

/** Worker da `supplier-discovery-queue` (concorrência 1: máquina leve, provedores com rate limit). */
export function createDiscoveryWorker(connection: Redis): Worker {
  const worker = new Worker(
    QUEUE_NAMES.supplierDiscovery,
    async (job, token) => {
      const data = discoveryJobSchema.parse(job.data);
      const searchStartDate = await loadSearchStartDate(data.eventId);
      if (await deferOutsideBusinessWindow(job, token, new Date(), searchStartDate)) {
        logger.info({ eventId: data.eventId, round: data.round }, "descoberta adiada para o próximo dia útil");
        throw new DelayedError();
      }
      const env = serverEnv();
      const router = getRouter();
      // Busca ao vivo do Grok conta no mesmo teto de 25% do roteador de LLM.
      const usage = router !== null ? createRouterUsageStore(router, env.AI_GROK_SEARCH_CALL_MICROUSD) : createRedisLlmUsage();
      const providers = resolveProviders(
        { ...env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
          SERPER_API_KEY: process.env.SERPER_API_KEY, GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY },
        undefined,
        usage,
        (provider) => meterUsage(provider, "discovery", { eventId: data.eventId }),
      );
      const summary = await runDiscoveryRound(createDiscoveryDeps(), providers, data);
      logger.info(
        { eventId: data.eventId, round: data.round, status: summary.status, providers: providers.map((p) => p.name) },
        "rodada de descoberta concluída",
      );
      return summary;
    },
    { connection, concurrency: 1 },
  );
  worker.on("failed", (job, error) => {
    logger.warn({ queue: worker.name, jobId: job?.id, reason: error.message }, "descoberta falhou");
  });
  return worker;
}
