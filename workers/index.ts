import { Worker } from "bullmq";

import { serverEnv } from "@/lib/env";
import { handleAsaasWebhookJob, type AsaasWebhookJob } from "@/lib/jobs/asaas-webhook";
import { runAsaasReconcileSweep } from "@/lib/jobs/asaas-reconcile";
import { runCreditsExpireSweep } from "@/lib/jobs/credits-expire";
import { runTestimonialInviteSweep } from "@/lib/jobs/testimonial-invites";
import { runInstanceHealthSweep } from "@/lib/jobs/whatsapp-instance-health";
import {
  handleWhatsappOutboundJob,
  markWhatsappMessageFailed,
  type WhatsappOutboundJob,
} from "@/lib/jobs/whatsapp-outbound";
import { logger } from "@/lib/logger";
import { createProspectingWorker, createSessionLifecycleWorker } from "@/lib/queue/whatsapp-worker";
import { QUEUE_NAMES, getQueue, getRedisConnection } from "@/lib/queue";

/**
 * Processo de workers (BullMQ) — separado do runtime do Next.
 * Execução: `pnpm workers` (ver README).
 */
const connection = getRedisConnection();

const asaasWorker = new Worker<AsaasWebhookJob>(
  QUEUE_NAMES.asaasWebhooks,
  async (job) => {
    await handleAsaasWebhookJob(job.data);
  },
  { connection, concurrency: 2 },
);

const whatsappWorker = new Worker<WhatsappOutboundJob>(
  QUEUE_NAMES.whatsappOutbound,
  async (job) => {
    await handleWhatsappOutboundJob(job.data);
  },
  { connection, concurrency: 1, limiter: { max: 15, duration: 60_000 } },
);

const testimonialWorker = new Worker(
  QUEUE_NAMES.testimonialInvites,
  async () => {
    await runTestimonialInviteSweep();
  },
  { connection, concurrency: 1 },
);

const reconcileWorker = new Worker(
  QUEUE_NAMES.asaasReconcile,
  async () => {
    await runAsaasReconcileSweep();
  },
  { connection, concurrency: 1 },
);

const creditsExpireWorker = new Worker(
  QUEUE_NAMES.creditsExpire,
  async () => {
    await runCreditsExpireSweep();
  },
  { connection, concurrency: 1 },
);

const instanceHealthWorker = new Worker(
  QUEUE_NAMES.whatsappInstanceHealth,
  async () => {
    await runInstanceHealthSweep();
  },
  { connection, concurrency: 1 },
);

// Agente Orçamentista: pacing humanizado 45–90s POR INSTÂNCIA (reserva atômica no Redis);
// concorrência configurável para ~100 sessões simultâneas.
const prospectingWorker = createProspectingWorker(
  connection,
  serverEnv().WHATSAPP_PROSPECTING_CONCURRENCY,
);
// Fim da janela de coleta (30–60 min): logout gracioso + notificação quotations_ready.
const sessionLifecycleWorker = createSessionLifecycleWorker(connection);

// Agendamentos (America/Sao_Paulo):
// 09:30 — conciliação Asaas (PAYMENTS.md §8)
// 10:00 — convites de depoimento pós-evento
// 11:00 — expiração de franquias (COMMERCIAL_MODEL.md §3.3)
// a cada 5 min — saúde das instâncias WhatsApp (retoma a fila de prospecção)
void getQueue(QUEUE_NAMES.asaasReconcile).add(
  "sweep",
  {},
  { repeat: { pattern: "30 9 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.testimonialInvites).add(
  "sweep",
  {},
  { repeat: { pattern: "0 10 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.creditsExpire).add(
  "sweep",
  {},
  { repeat: { pattern: "0 11 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.whatsappInstanceHealth).add(
  "sweep",
  {},
  { repeat: { pattern: "*/5 * * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);

whatsappWorker.on("failed", (job, error) => {
  if (job === null || job === undefined) {
    return;
  }
  const maxAttempts = job.opts.attempts ?? 1;
  const finalFailure = job.attemptsMade >= maxAttempts;
  logger.warn(
    { queue: QUEUE_NAMES.whatsappOutbound, jobId: job.id, finalFailure },
    "job de WhatsApp falhou",
  );
  if (finalFailure) {
    void markWhatsappMessageFailed(job.data.messageId, error.message);
  }
});

const workers = [
  asaasWorker,
  whatsappWorker,
  testimonialWorker,
  reconcileWorker,
  creditsExpireWorker,
  instanceHealthWorker,
  prospectingWorker,
  sessionLifecycleWorker,
];

for (const worker of workers) {
  worker.on("error", (error) => {
    logger.error({ queue: worker.name, reason: error.message }, "erro no worker");
  });
}

logger.info(
  { queues: workers.map((worker) => worker.name) },
  "workers da EventeIA online",
);

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
