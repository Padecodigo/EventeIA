import "server-only";

import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";

import { localDateKey, msUntilBusinessHours, shouldAutoPause } from "@/lib/discovery/pure";
import { serverEnv } from "@/lib/env";
import {
  archiveChat,
  checkWhatsappNumber,
  EvolutionSessionError,
} from "@/lib/evolution-api/client";
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
import { recipientOptedOut } from "@/lib/whatsapp/opt-out-runtime";
import { resolveEventChannel, sendFirstContactVia } from "@/lib/whatsapp/provider";
import { canSendFirstContact, toSessionState } from "@/lib/whatsapp/session-lifecycle";
import { finishCollection, handleSessionLost } from "@/lib/whatsapp/session-manager";
import { createSessionDeps, eventPausedKey, findEventInstance, isEventPaused } from "@/lib/whatsapp/session-runtime";

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
const DAILY_CAP_RECHECK_MS = 60 * 60_000;

export function dailyContactsKey(instance: string, now: Date): string {
  return `eventeia:prospect-daily:${instance}:${localDateKey(now)}`;
}
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
  pacingRedis?: Redis,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const data = prospectingJobSchema.parse(job.data);

  // Regra 3: opt-out (ou já enviado) — pula o envio imediatamente.
  const { data: prospect } = await admin
    .from("vendor_prospects")
    .select("id,status,vendor_name,vendor_category,dry_run,supplier_id")
    .eq("id", data.prospectId)
    .maybeSingle();

  if (prospect === null) {
    logger.warn({ prospectId: data.prospectId }, "prospect não encontrado — job descartado");
    return;
  }
  if (prospect.status === "opt_out" || prospect.status === "sent") {
    return;
  }
  // Dry-run (mock/homologação): NUNCA envia — fica registrado como pendente.
  if (data.dryRun === true || prospect.dry_run) {
    logger.info({ prospectId: data.prospectId }, "dry-run: envio suprimido");
    return;
  }
  // Dia útil (seg–sex, sem feriados nacionais), 9h–18h (Brasília): fora disso, adia — nunca descarta.
  const waitBusiness = msUntilBusinessHours(new Date());
  if (waitBusiness > 0) {
    await delay(job, Date.now() + waitBusiness, token);
  }

  // Regra 4: evento pausado por queda de sessão — adia sem consumir tentativa.
  if (await isEventPaused(data.eventId)) {
    await delay(job, Date.now() + PAUSED_EVENT_RECHECK_MS, token);
  }

  // Canal do evento: cloud (número EventeIA, sem sessão) ou evolution (WhatsApp do cliente).
  const channel = await resolveEventChannel(data.eventId);

  if (channel === "evolution") {
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
  }

  // Anti-ban: teto diário de primeiros contatos por instância.
  const redis = pacingRedis;
  const dailyKey = dailyContactsKey(data.instance, new Date());
  if (redis !== undefined && Number((await redis.get(dailyKey)) ?? "0") >= serverEnv().WHATSAPP_DAILY_FIRST_CONTACTS) {
    await delay(job, Date.now() + DAILY_CAP_RECHECK_MS, token);
  }

  // Anti-ban: muitas recusas no evento ⇒ pausa automática do evento.
  const { data: statsRows } = await admin
    .from("vendor_prospects")
    .select("status")
    .eq("event_id", data.eventId)
    .in("status", ["sent", "replied", "opt_out"]);
  const contacted = (statsRows ?? []).length;
  const optOuts = (statsRows ?? []).filter((r) => r.status === "opt_out").length;
  if (shouldAutoPause({ contacted, optOuts })) {
    if (redis !== undefined) await redis.set(eventPausedKey(data.eventId), "auto-optout", "EX", 7 * 24 * 3600);
    await admin.from("events").update({ discovery_status: "paused" }).eq("id", data.eventId);
    logger.warn({ eventId: data.eventId, contacted, optOuts }, "pausa automática: taxa de opt-out alta");
    return;
  }

  // Confirma que o número tem WhatsApp antes de gastar o envio.
  // (Cloud API: a própria Meta reporta número inválido via status "failed".)
  try {
    if (channel === "evolution" && !(await checkWhatsappNumber(data.instance, data.phoneE164))) {
      await admin.from("vendor_prospects").update({ status: "failed" }).eq("id", data.prospectId);
      if (prospect.supplier_id !== null) {
        await admin.from("suppliers").update({ whatsapp_verified: false }).eq("id", prospect.supplier_id);
      }
      return;
    }
  } catch (error) {
    if (error instanceof EvolutionSessionError) {
      await handleSessionLost(createSessionDeps(), { instance: data.instance, eventId: data.eventId });
      await delay(job, Date.now() + PAUSED_EVENT_RECHECK_MS, token);
    }
    throw error;
  }

  // Regra 1: reserva atômica do intervalo humanizado desta instância.
  const decision = await reservePacingSlot(pacing, data.instance, Date.now());
  if (!decision.allowed) {
    await delay(job, decision.retryAtMs, token);
    return;
  }

  // Revogação vence até o último instante (consents opted_out / fornecedor com opt-out).
  if (
    await recipientOptedOut({
      phoneE164: data.phoneE164,
      prospectStatus: prospect.status,
      supplierId: prospect.supplier_id,
    })
  ) {
    await admin.from("vendor_prospects").update({ status: "opt_out" }).eq("id", data.prospectId);
    logger.info({ prospectId: data.prospectId }, "envio cancelado: destinatário revogou o contato");
    return;
  }

  const message = data.messageText ?? renderFirstContact(data);

  let externalMessageId: string | undefined;
  try {
    ({ externalMessageId } = await sendFirstContactVia(channel, {
      instance: data.instance,
      to: data.phoneE164,
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
      channel,
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

  if (redis !== undefined) {
    await redis.incr(dailyKey);
    await redis.expire(dailyKey, 2 * 24 * 3600);
  }
  if (prospect.supplier_id !== null) {
    await admin
      .from("suppliers")
      .update({ last_contacted_at: nowIso, whatsapp_verified: true })
      .eq("id", prospect.supplier_id);
  }
  // Número pessoal: arquiva a conversa do fornecedor (best-effort).
  const { data: modeRow } = await admin
    .from("whatsapp_instances")
    .select("number_mode")
    .eq("instance_name", data.instance)
    .maybeSingle();
  if (channel === "evolution" && modeRow?.number_mode === "personal") {
    try {
      await archiveChat(data.instance, data.phoneE164);
    } catch {
      logger.warn({ prospectId: data.prospectId }, "não foi possível arquivar a conversa");
    }
  }

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
      await processProspectingJob(job, token, pacing, connection);
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

/** Worker do fim da coleta: (sessão ativa) draining → entrega → logout → disconnected → notifica. */
export function createSessionLifecycleWorker(connection: Redis): Worker {
  return new Worker<{ instance?: string | null; eventId: string; reason?: "window_closed" | "collection_complete" }>(
    QUEUE_NAMES.whatsappSessionLifecycle,
    async (job) => {
      const instance = job.data.instance ?? (await findEventInstance(job.data.eventId));
      const result = await finishCollection(createSessionDeps(), {
        instance,
        eventId: job.data.eventId,
        reason: job.data.reason ?? "window_closed",
      });
      logger.info({ instance, eventId: job.data.eventId, result }, "coleta encerrada");
    },
    { connection, concurrency: 5 },
  );
}
