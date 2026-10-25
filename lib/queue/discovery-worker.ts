import "server-only";

import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";

import { createRouterUsageStore, getRouter } from "@/lib/ai/runtime";
import { DISCOVERY_WINDOW, msUntilBusinessWindow } from "@/lib/business-days";
import { runDiscoveryRound } from "@/lib/discovery/engine";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { createDiscoveryDeps, createRedisLlmUsage } from "@/lib/discovery/runtime";
import { serverEnv } from "@/lib/env";
import { meterUsage } from "@/lib/finance/metering";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES } from "@/lib/queue";

const discoveryJobSchema = z.object({ eventId: z.string().uuid(), round: z.number().int().min(0).max(1000) });

/**
 * Descoberta só em dia útil brasileiro (seg–sex, sem feriados nacionais), 8h–18h de Brasília.
 * Fora da janela o job é ADIADO (BullMQ delayed) para a próxima abertura — nunca descartado.
 * Retorna true quando adiou (o chamador deve lançar DelayedError).
 */
export async function deferOutsideBusinessWindow(
  job: Pick<Job, "moveToDelayed">,
  token: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  const wait = msUntilBusinessWindow(now, DISCOVERY_WINDOW);
  if (wait <= 0) return false;
  await job.moveToDelayed(now.getTime() + wait, token);
  return true;
}

/** Worker da `supplier-discovery-queue` (concorrência 1: máquina leve, provedores com rate limit). */
export function createDiscoveryWorker(connection: Redis): Worker {
  const worker = new Worker(
    QUEUE_NAMES.supplierDiscovery,
    async (job, token) => {
      const data = discoveryJobSchema.parse(job.data);
      if (await deferOutsideBusinessWindow(job, token)) {
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
