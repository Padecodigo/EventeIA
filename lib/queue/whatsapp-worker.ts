import "server-only";

import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";

import { EvolutionSessionError, sendFirstContact } from "@/lib/evolution-api/client";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { QUEUE_NAMES } from "@/lib/queue";
import { reservePacingSlot, type PacingStore } from "@/lib/queue/prospecting-pacing";
import {
  prospectingJobSchema,
  renderFirstContact,
  type ProspectingJob,
} from "@/lib/schemas/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canSendFirstContact, toSessionState } from "@/lib/whatsapp/session-lifecycle";
import { endCollectionWindow, handleSessionLost } from "@/lib/whatsapp/session-manager";
import { createSessionDeps, isEventPaused } from "@/lib/whatsapp/session-runtime";

/**
 * Agente Orçamentista — worker da fila `quotation-prospecting-queue`.
 *
 * Regras invioláveis (ver .context/WHATSAPP_EVOLUTION.md):
 * 1. Pacing humanizado POR INSTÂNCIA: intervalo aleatório 45–90s, reservado
 *    atomicamente (SET NX PX). Instâncias diferentes não se bloqueiam (≈100 sessões).
 * 2. Primeiro contato: texto puro validado por Zod (payload estrito, sem anexos/URLs).
 * 3. Opt-out do fornecedor pula o envio imediatamente.
 * 4. Sessão inválida/desconectada: instância `disconnected`, pausa SÓ os jobs
 *    do evento (flag Redis) e notifica o app — nunca a fila global.
 */

const SESSION_WAIT_MS = 60_000;
const PAUSED_EVENT_RECHECK_MS = 15 * 60_000;

export function createRedisPacingStore(redis: Redis): PacingStore {
  return {
    async setIfAbsent(key, ttlMs) {
      return (await redis.set(key, "1", "PX", ttlMs, "NX")) === "OK";
    },
    async ttlMs(key) {
      return redis.pttl(key);
    },
  };
}

async function delay(job: Job, untilMs: number, token: string | undefined): Promise<never> {
  await job.moveToDelayed(untilMs, token);
  // BullMQ v5: após moveToDelayed é obrigatório lançar DelayedError.
  throw new DelayedError();
}

async function processProspectingJob(
  job: Job<ProspectingJob>,
  token: string | undefined,
  pacing: PacingStore,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const data = prospectingJobSchema.parse(job.data);

  // Regra 3: opt-out (ou já enviado) — pula o envio imediatamente.
  const { data: prospect } = await admin
    .from("vendor_prospects")
    .select("id,status,vendor_name,vendor_category")
    .eq("id", data.prospectId)
    .maybeSingle();

  if (prospect === null) {
    logger.warn({ prospectId: data.prospectId }, "prospect não encontrado — job descartado");
    return;
  }
  if (prospect.status === "opt_out" || prospect.status === "sent") {
    return;
  }

  // Regra 4: evento pausado por queda de sessão — adia sem consumir tentativa.
  if (await isEventPaused(data.eventId)) {
    await delay(job, Date.now() + PAUSED_EVENT_RECHECK_MS, token);
  }

  const { data: instanceRow } = await admin
    .from("whatsapp_instances")
    .select("status")
    .eq("instance_name", data.instance)
    .maybeSingle();
  const state = toSessionState(instanceRow?.status ?? "connecting");

  if (state === "connecting") {
    await delay(job, Date.now() + SESSION_WAIT_MS, token); // aguardando QR/pareamento
  }
  if (!canSendFirstContact(state)) {
    logger.info({ prospectId: data.prospectId, state }, "sessão fora de 'active' — envio não iniciado");
    return;
  }

  // Regra 1: reserva atômica do intervalo humanizado desta instância.
  const decision = await reservePacingSlot(pacing, data.instance, Date.now());
  if (!decision.allowed) {
    await delay(job, decision.retryAtMs, token);
    return;
  }

  const message = renderFirstContact(data);

  let externalMessageId: string | undefined;
  try {
    ({ externalMessageId } = await sendFirstContact(data.instance, {
      number: data.phoneE164,
      text: message,
    }));
  } catch (error) {
    if (error instanceof EvolutionSessionError) {
      await handleSessionLost(createSessionDeps(), { instance: data.instance, eventId: data.eventId });
      await delay(job, Date.now() + PAUSED_EVENT_RECHECK_MS, token);
    }
    throw error;
  }

  const nowIso = new Date().toISOString();
  await admin.from("whatsapp_messages").upsert(
    {
      event_id: data.eventId,
      direction: "outbound",
      template: "vendor_first_contact",
      to_number_e164: data.phoneE164,
      body: message,
      status: "sent",
      external_message_id: externalMessageId ?? null,
      sent_at: nowIso,
      idempotency_key: `prospect:${data.prospectId}`,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  await admin
    .from("vendor_prospects")
    .update({ status: "sent", last_message_at: nowIso })
    .eq("id", data.prospectId);

  try {
    await emitFeed(admin, {
      type: "vendor.prospected",
      actorType: "system",
      aggregateType: "event",
      aggregateId: data.eventId,
      payload: { vendor: prospect.vendor_name, category: prospect.vendor_category },
      correlationId: data.prospectId,
      source: "worker",
    });
  } catch {
    // feed não bloqueia o envio
  }

  logger.info(
    { prospectId: data.prospectId, instance: data.instance, nextIntervalSeconds: decision.intervalSeconds },
    "prospecção enviada ao fornecedor",
  );
}

/**
 * Worker da fila de prospecção. Sem limiter global: o limite é por instância
 * (pacing). `concurrency` atende várias sessões em paralelo com UMA conexão
 * Redis compartilhada (BullMQ duplica só a conexão bloqueante do worker).
 */
export function createProspectingWorker(connection: Redis, concurrency: number): Worker {
  const pacing = createRedisPacingStore(connection);

  const worker = new Worker<ProspectingJob>(
    QUEUE_NAMES.quotationProspecting,
    async (job, token) => {
      await processProspectingJob(job, token, pacing);
    },
    { connection, concurrency: Math.max(1, Math.min(200, concurrency)) },
  );

  worker.on("failed", (job, error) => {
    logger.warn(
      { queue: worker.name, jobId: job?.id, reason: error.message },
      "job de prospecção falhou (retry com backoff)",
    );
  });

  return worker;
}

/** Worker do fim da janela de coleta: draining → logout → disconnected → notifica. */
export function createSessionLifecycleWorker(connection: Redis): Worker {
  return new Worker<{ instance: string; eventId: string }>(
    QUEUE_NAMES.whatsappSessionLifecycle,
    async (job) => {
      const result = await endCollectionWindow(createSessionDeps(), job.data);
      logger.info({ instance: job.data.instance, result }, "janela de coleta encerrada");
    },
    { connection, concurrency: 5 },
  );
}
