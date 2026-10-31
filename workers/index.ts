import { Worker } from "bullmq";

import { serverEnv } from "@/lib/env";
import { runBalanceCheck } from "@/lib/finance/balance-monitor";
import { publishWithBrowser } from "@/lib/instagram-browser/publish";
import { runAsaasReconcileSweep } from "@/lib/jobs/asaas-reconcile";
import { handleAsaasWebhookJob, type AsaasWebhookJob } from "@/lib/jobs/asaas-webhook";
import {
  externalEventIdOf,
  handleMetaWebhookJob,
  markMetaWebhookFailed,
  type MetaWebhookJobData,
} from "@/lib/jobs/meta-webhook";
import {
  handleProspectReplyJob,
  type ProspectReplyJobData,
} from "@/lib/jobs/prospect-reply";
import { logger } from "@/lib/logger";
import { runMetaTokenHealthCheck } from "@/lib/meta/token-health-monitor";
import { QUEUE_NAMES, getQueue, getRedisConnection } from "@/lib/queue";
import { createDiscoveryWorker } from "@/lib/queue/discovery-worker";
import { createQuoteExtractionWorker } from "@/lib/queue/quote-extraction-worker";
import { purgeExpiredArt } from "@/lib/prospecting/art-cache";
import { deleteFinishedProspectPosts } from "@/lib/prospecting/delete-posts";
import { publishAutopilotPost } from "@/lib/marketing/autopilot";
import { isAutopilotEnabled } from "@/lib/marketing/settings";

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

const metaWebhooksWorker = new Worker<MetaWebhookJobData>(
  QUEUE_NAMES.metaWebhooks,
  async (job) => {
    await handleMetaWebhookJob(job.data);
  },
  { connection, concurrency: 2 },
);

metaWebhooksWorker.on("failed", (job, error) => {
  if (job === undefined) return;
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void markMetaWebhookFailed(job.data).catch((caught: unknown) => {
      logger.error(
        { externalEventId: externalEventIdOf(job.data), reason: caught instanceof Error ? caught.message : "?" },
        "falha ao marcar webhook meta como failed",
      );
    });
  }
});

const prospectReplyWorker = new Worker<ProspectReplyJobData>(
  QUEUE_NAMES.prospectReply,
  async (job) => {
    await handleProspectReplyJob(job.data);
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

// Saúde do token da Meta: válido/escopos (banner/e-mail), diário 08:10.
const metaTokenHealthWorker = new Worker(
  QUEUE_NAMES.metaTokenHealth,
  async () => {
    await runMetaTokenHealthCheck();
  },
  { connection, concurrency: 1 },
);

// Publicidade automática (só quando o botão do admin está ligado).
const marketingAutopilotWorker = new Worker(
  QUEUE_NAMES.marketingAutopilot,
  async () => {
    if (!(await isAutopilotEnabled())) return;
    await publishAutopilotPost();
  },
  { connection, concurrency: 1 },
);

// Limpeza da arte em cache (TTL de 1h).
const artCleanupWorker = new Worker(
  QUEUE_NAMES.artCleanup,
  async () => {
    await purgeExpiredArt();
  },
  { connection, concurrency: 1 },
);

// Exclusão dos posts de isca quando a prospecção do evento termina.
const prospectPostDeleteWorker = new Worker(
  QUEUE_NAMES.prospectPostDelete,
  async () => {
    const env = serverEnv();
    if (env.META_ACCESS_TOKEN === undefined || env.META_INSTAGRAM_BUSINESS_ID === undefined) {
      return; // Meta não configurada: não há mídia para apagar.
    }
    const deleted = await deleteFinishedProspectPosts({
      meta: {
        igUserId: env.META_INSTAGRAM_BUSINESS_ID,
        accessToken: env.META_ACCESS_TOKEN,
        apiVersion: env.META_API_VERSION,
        apiHost: env.META_API_HOST,
      },
    });
    if (deleted > 0) {
      logger.info({ deleted }, "posts de isca excluídos após prospecção");
    }
  },
  { connection, concurrency: 1 },
);

// Publicação de isca via navegador logado (Playwright no container do worker).
const instagramPublishWorker = new Worker(
  QUEUE_NAMES.instagramPublish,
  async (job) => {
    const data = job.data as { imageUrl: string; caption: string };
    const result = await publishWithBrowser({ imageUrl: data.imageUrl, caption: data.caption });
    if (!result.ok) throw new Error(result.error);
  },
  { connection, concurrency: 1 },
);

// Descoberta automática de fornecedores e extração de cotações.
const discoveryWorker = createDiscoveryWorker(connection);
const quoteExtractionWorker = createQuoteExtractionWorker(connection);

// Agendamentos (America/Sao_Paulo):
// 09:30 — conciliação Asaas (PAYMENTS.md §8)
// 08:00 — saúde financeira
// 08:10 — saúde do token Meta
void getQueue(QUEUE_NAMES.asaasReconcile).add(
  "sweep",
  {},
  { repeat: { pattern: "30 9 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.marketingAutopilot).add(
  "hourly",
  {},
  { repeat: { pattern: "0 * * * *", tz: "America/Sao_Paulo" }, attempts: 2 },
);
void getQueue(QUEUE_NAMES.artCleanup).add(
  "sweep",
  {},
  { repeat: { pattern: "*/30 * * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.prospectPostDelete).add(
  "sweep",
  {},
  { repeat: { pattern: "0 * * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.financeBalanceCheck).add(
  "check",
  {},
  { repeat: { pattern: "0 8 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
void getQueue(QUEUE_NAMES.metaTokenHealth).add(
  "check",
  {},
  { repeat: { pattern: "10 8 * * *", tz: "America/Sao_Paulo" }, attempts: 3 },
);
// Créditos nunca expiram (0037): remove o agendamento legado de expiração, se existir.
void getQueue(QUEUE_NAMES.creditsExpireLegacy)
  .getRepeatableJobs()
  .then(async (jobs) => {
    const queue = getQueue(QUEUE_NAMES.creditsExpireLegacy);
    for (const job of jobs) await queue.removeRepeatableByKey(job.key);
  })
  .catch(() => undefined);

const workers = [asaasWorker, metaWebhooksWorker, prospectReplyWorker, reconcileWorker, balanceWorker, metaTokenHealthWorker, artCleanupWorker, prospectPostDeleteWorker, instagramPublishWorker, marketingAutopilotWorker, discoveryWorker, quoteExtractionWorker];

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
