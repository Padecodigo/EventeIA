import "server-only";

import { Queue, Worker, type Job } from "bullmq";

import { sendText } from "@/lib/evolution-api/client";
import { EvolutionSessionError } from "@/lib/evolution-api/client";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import {
  pickIntervalSeconds,
  resolveIntervalSeconds,
} from "@/lib/queue/prospecting-pacing";
import {
  prospectingJobSchema,
  renderFirstContact,
  type ProspectingJob,
} from "@/lib/schemas/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Agente Orçamentista — worker da fila `quotation-prospecting-queue`.
 *
 * Regras invioláveis (ver .context/WHATSAPP_EVOLUTION.md):
 * 1. Pacing humanizado por instância: intervalo ALEATÓRIO de 45–90s entre
 *    disparos (chave Redis por instância; BullMQ limiter como piso rígido).
 * 2. Primeiro contato: texto puro validado por Zod (sem URLs/emojis/anexos).
 * 3. Opt-out do fornecedor pula o envio imediatamente.
 * 4. Sessão desconectada: pausa a fila + status da instância no banco.
 */


const PACE_TTL_SECONDS = 15 * 60;

function pacingKey(instance: string): string {
  return `eventeia:prospect-pace:${instance}`;
}

async function readNextAllowedAt(instance: string): Promise<number> {
  const redis = getRedisConnection();
  const value = await redis.get(pacingKey(instance));
  return value === null ? 0 : Number(value);
}

async function writeNextAllowedAt(instance: string, nextAllowedAt: number): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(pacingKey(instance), String(nextAllowedAt), "EX", PACE_TTL_SECONDS);
}

async function handleSessionDisconnected(instance: string, queue: Queue): Promise<void> {
  const admin = getSupabaseAdmin();

  await admin
    .from("whatsapp_instances")
    .update({ status: "disconnected", last_checked_at: new Date().toISOString() })
    .eq("instance_name", instance);

  await queue.pause();

  try {
    await emitFeed(admin, {
      type: "whatsapp.instance_disconnected",
      actorType: "system",
      aggregateType: "whatsapp_instance",
      aggregateId: instance,
      payload: { action: "queue_paused", queue: QUEUE_NAMES.quotationProspecting },
      correlationId: `pause:${instance}:${String(Date.now())}`,
      source: "worker",
    });
  } catch {
    // feed não bloqueia a pausa
  }

  logger.error({ instance, queue: queue.name }, "sessão desconectada — fila pausada");
}

async function processProspectingJob(
  job: Job<ProspectingJob>,
  _queue: Queue,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { prospectId, instance, phoneE164 } = prospectingJobSchema.parse(job.data);

  // Regra 3: opt-out (ou já enviado) — pula o envio imediatamente.
  const { data: prospect } = await admin
    .from("vendor_prospects")
    .select("id,status,vendor_name,vendor_category")
    .eq("id", prospectId)
    .maybeSingle();

  if (prospect === null) {
    logger.warn({ prospectId }, "prospect não encontrado — job descartado");
    return;
  }

  if (prospect.status === "opt_out" || prospect.status === "sent") {
    return;
  }

  // Regra 1: pacing humanizado — adia o job sem ocupar o worker.
  const nextAllowedAt = await readNextAllowedAt(instance);
  const now = Date.now();

  if (nextAllowedAt > now) {
    await job.moveToDelayed(nextAllowedAt, job.token);
    return;
  }

  const parsedJob = prospectingJobSchema.parse(job.data);
  const message = renderFirstContact({
    vendorName: parsedJob.vendorName,
    eventTitle: parsedJob.eventTitle,
    eventType: parsedJob.eventType,
    eventDateIso: parsedJob.eventDateIso,
    city: parsedJob.city,
    guestCount: parsedJob.guestCount,
  });

  const result = await sendText(instance, phoneE164, message);

  // Registra a mensagem enviada (auditoria) e agenda o próximo intervalo.
  await admin.from("whatsapp_messages").upsert(
    {
      event_id: parsedJob.eventId,
      direction: "outbound",
      template: "vendor_first_contact",
      to_number_e164: phoneE164,
      body: message,
      status: "sent",
      external_message_id: result.externalMessageId ?? null,
      sent_at: new Date().toISOString(),
      idempotency_key: `prospect:${String(prospectId)}`,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  await admin
    .from("vendor_prospects")
    .update({ status: "sent", last_message_at: new Date().toISOString() })
    .eq("id", prospectId);

  await writeNextAllowedAt(instance, Date.now() + pickIntervalSeconds() * 1000);

  try {
    await emitFeed(admin, {
      type: "vendor.prospected",
      actorType: "system",
      aggregateType: "event",
      aggregateId: parsedJob.eventId,
      payload: { vendor: prospect.vendor_name, category: prospect.vendor_category },
      correlationId: String(prospectId),
      source: "worker",
    });
  } catch {
    // feed não bloqueia o envio
  }

  logger.info({ prospectId, instance }, "prospecção enviada ao fornecedor");
}

/**
 * Cria o worker da fila de prospecção.
 * `intervalSeconds` é o piso rígido do limiter BullMQ; o pacing humanizado
 * (45–90s por instância) fica na chave Redis (Regra 1).
 */
export function createProspectingWorker(
  connection: ReturnType<typeof getRedisConnection>,
  intervalSeconds: number,
): Worker {
  const queue = new Queue(QUEUE_NAMES.quotationProspecting, { connection });

  const worker = new Worker<ProspectingJob>(
    QUEUE_NAMES.quotationProspecting,
    async (job) => {
      await processProspectingJob(job, queue);
    },
    {
      connection,
      concurrency: 1,
      // Piso rígido por instância: no máximo 1 mensagem a cada `interval` s.
      // Piso rígido global; o pacing por instância (45–90s) fica na chave Redis
      // `eventeia:prospect-pace:<instância>` + moveToDelayed (prospecting-pacing.ts).
      limiter: { max: 1, duration: resolveIntervalSeconds(intervalSeconds) * 1000 },
    },
  );

  worker.on("failed", (job, error) => {
    if (error instanceof EvolutionSessionError) {
      const instance = job?.data.instance;
      if (typeof instance === "string") {
        void handleSessionDisconnected(instance, queue);
      }
      return;
    }
    logger.warn(
      { queue: worker.name, jobId: job?.id, reason: error.message },
      "job de prospecção falhou (retry com backoff)",
    );
  });

  worker.on("error", (error) => {
    logger.error({ queue: worker.name, reason: error.message }, "erro no worker de prospecção");
  });

  return worker;
}
