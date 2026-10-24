import "server-only";

import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";

import { createRouterUsageStore, getRouter } from "@/lib/ai/runtime";
import { runDiscoveryRound } from "@/lib/discovery/engine";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { createDiscoveryDeps, createRedisLlmUsage } from "@/lib/discovery/runtime";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES } from "@/lib/queue";

const discoveryJobSchema = z.object({ eventId: z.string().uuid(), round: z.number().int().min(0).max(1000) });

/** Worker da `supplier-discovery-queue` (concorrência 1: máquina leve, provedores com rate limit). */
export function createDiscoveryWorker(connection: Redis): Worker {
  const worker = new Worker(
    QUEUE_NAMES.supplierDiscovery,
    async (job) => {
      const data = discoveryJobSchema.parse(job.data);
      const env = serverEnv();
      const router = getRouter();
      // Busca ao vivo do Grok conta no mesmo teto de 25% do roteador de LLM.
      const usage = router !== null ? createRouterUsageStore(router, env.AI_GROK_SEARCH_CALL_MICROUSD) : createRedisLlmUsage();
      const providers = resolveProviders(env, undefined, usage);
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
