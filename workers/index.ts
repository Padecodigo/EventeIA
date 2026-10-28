import { Worker } from "bullmq";

import { runBalanceCheck } from "@/lib/finance/balance-monitor";
import { runAsaasReconcileSweep } from "@/lib/jobs/asaas-reconcile";
import { handleAsaasWebhookJob, type AsaasWebhookJob } from "@/lib/jobs/asaas-webhook";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES, getQueue, getRedisConnection } from "@/lib/queue";
import { createDiscoveryWorker } from "@/lib/queue/discovery-worker";
import { createQuoteExtractionWorker } from "@/lib/queue/quote-extraction-worker";

/**
 * Processo de workers (BullMQ) — separado do runtime do Next.
 * Execução: `pnpm workers` (ver README).
 *
 * WhatsApp/Evolution foram removidos: os workers de sessão, prospecção e saúde
 * da instância não são mais registrados.
 */
const connection = getRedisConnection();

const asaasWorker = new Worker<AsaasWebhookJob>(
  QUEUE_NAMES.asaasWebhooks,
  async (job) => {
    await handleAsaasWebhookJob(job.data);
  },
  { connection, concurrency: 2 },
);

const reconcileWorker = new Worker(
  QUEUE_NAMES.asaasReconcile,
  async () => {
    await runAsaasReconcileSweep();
  },
  { connection, concurrency: 1 },
);

// Saúde financeira: saldos dos provedores + alerta (banner/e-mail), diário 08:00.
const balanceWorker = new Worker(
  QUEUE_NAMES.financeBalanceCheck,
  async () => {
    await runBalanceCheck();
  },
  { connection, concurrency: 1 },
);

// Descoberta automática de fornecedores e extração de cotações.
const discoveryWorker = createDiscoveryWorker(connection);
const quoteExtractionWorker = createQuoteExtractionWorker(connection);

// Agendamentos (America/Sao_Paulo):
// 09:30 — conciliação Asaas (PAYMENTS.md §8)
// 08:00 — saúde financeira
void getQueue(QUEUE_NAMES.asaasReconcile).add(
  "sweep",
  {},
  { repeat: { pattern: "30 9 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.financeBalanceCheck).add(
  "check",
  {},
  { repeat: { pattern: "0 8 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
// Créditos nunca expiram (0037): remove o agendamento legado de expiração, se existir.
void getQueue(QUEUE_NAMES.creditsExpireLegacy)
  .getRepeatableJobs()
  .then(async (jobs) => {
    const queue = getQueue(QUEUE_NAMES.creditsExpireLegacy);
    for (const job of jobs) await queue.removeRepeatableByKey(job.key);
  })
  .catch(() => undefined);

const workers = [asaasWorker, reconcileWorker, balanceWorker, discoveryWorker, quoteExtractionWorker];

for (const worker of workers) {
  worker.on("error", (error) => {
    logger.error({ queue: worker.name, reason: error.message }, "erro no worker");
  });
}

logger.info({ queues: workers.map((worker) => worker.name) }, "workers da EventeIA online");

async function shutdown(): Promise<void> {
  logger.info("encerrando workers…");
  await Promise.all(workers.map((worker) => worker.close()));
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
