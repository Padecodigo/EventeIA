import "server-only";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { serverEnv } from "./env";
import { logger } from "./logger";

export const QUEUE_NAMES = {
  asaasWebhooks: "asaas-webhooks",
  quotationProspecting: "quotation-prospecting-queue",
  whatsappSessionLifecycle: "whatsapp-session-lifecycle",
  whatsappInstanceHealth: "whatsapp-instance-health",
  asaasReconcile: "asaas-reconcile",
  whatsappOutbound: "whatsapp-outbound",
  feedsDispatch: "feeds-dispatch",
  /** Legado: só para remover o agendamento antigo (créditos não expiram). */
  creditsExpireLegacy: "credits-expire",
  testimonialInvites: "testimonial-invites",
  supplierDiscovery: "supplier-discovery-queue",
  quoteExtraction: "quote-extraction-queue",
  financeBalanceCheck: "finance-balance-check",
  metaTokenHealth: "meta-token-health",
  artCleanup: "art-cleanup",
  marketingAutopilot: "marketing-autopilot",
  prospectPostDelete: "prospect-post-delete",
  instagramPublish: "instagram-publish",
  metaWebhooks: "meta-webhooks",
  prospectReply: "prospect-reply",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let connection: Redis | undefined;
const queues = new Map<QueueName, Queue>();

export function getRedisConnection(): Redis {
  if (connection === undefined) {
    connection = new Redis(serverEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing !== undefined) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  });

  queues.set(name, queue);
  return queue;
}

const ENQUEUE_TIMEOUT_MS = 2_500;

/**
 * Enfileira com guarda de timeout: com Redis indisponível, o ioredis com
 * `maxRetriesPerRequest: null` NUNCA rejeita — sem esta corrida, o chamador
 * (ex.: webhook do Asaas) travaria por minutos. Retorna false quando a fila
 * não respondeu; o evento já persistido segue via conciliação/reprocesso.
 */
export async function enqueue(
  queueName: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  opts?: {
    jobId?: string;
    delayMs?: number;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  },
): Promise<boolean> {
  try {
    const jobOpts = {
      ...(opts?.jobId !== undefined ? { jobId: opts.jobId } : {}),
      ...(opts?.delayMs !== undefined ? { delay: Math.max(0, opts.delayMs) } : {}),
      ...(opts?.removeOnComplete !== undefined ? { removeOnComplete: opts.removeOnComplete } : {}),
      ...(opts?.removeOnFail !== undefined ? { removeOnFail: opts.removeOnFail } : {}),
    };
    await Promise.race([
      getQueue(queueName).add(jobName, data, jobOpts),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timeout enfileirando em ${queueName}`)),
          ENQUEUE_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
    return true;
  } catch (error) {
    logger.error(
      { queue: queueName, reason: error instanceof Error ? error.message : "desconhecido" },
      "fila indisponível — job não enfileirado",
    );
    return false;
  }
}
