import "server-only";

import { logoutInstance } from "@/lib/evolution-api/client";
import { logger } from "@/lib/logger";
import { notifyQuotationsReady } from "@/lib/notifications/runtime";
import { enqueue, getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import { deliverEventQuotes } from "@/lib/quotes/delivery";
import { createDeliveryDeps } from "@/lib/quotes/delivery-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { SessionDeps } from "./session-manager";

/** Flag Redis que pausa SÓ os jobs do evento (não a fila global). */
export function eventPausedKey(eventId: string): string {
  return `eventeia:event-paused:${eventId}`;
}

const EVENT_PAUSE_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function isEventPaused(eventId: string): Promise<boolean> {
  return (await getRedisConnection().exists(eventPausedKey(eventId))) === 1;
}

/** Pausa SÓ os jobs do evento (não a fila global). */
export async function pauseEventJobs(eventId: string): Promise<void> {
  await getRedisConnection().set(eventPausedKey(eventId), "1", "EX", EVENT_PAUSE_TTL_SECONDS);
}

export async function resumeEventJobs(eventId: string): Promise<void> {
  await getRedisConnection().del(eventPausedKey(eventId));
}

export function createSessionDeps(): SessionDeps {
  const admin = getSupabaseAdmin();
  return {
    now: () => Date.now(),
    async getStatus(instance) {
      const { data } = await admin
        .from("whatsapp_instances")
        .select("status")
        .eq("instance_name", instance)
        .maybeSingle();
      return data?.status ?? null;
    },
    async setStatus(instance, state, extra) {
      const nowIso = new Date().toISOString();
      await admin
        .from("whatsapp_instances")
        .update({
          status: state,
          last_checked_at: nowIso,
          ...(extra?.eventId !== undefined ? { event_id: extra.eventId } : {}),
          ...(extra?.windowMinutes !== undefined
            ? { collection_window_minutes: extra.windowMinutes, activated_at: nowIso }
            : {}),
          ...(extra?.drainAtMs !== undefined
            ? { drain_at: new Date(extra.drainAtMs).toISOString() }
            : {}),
          ...(state === "disconnected" ? { disconnected_at: nowIso } : {}),
        })
        .eq("instance_name", instance);
    },
    logout: logoutInstance,
    pauseEventJobs,
    resumeEventJobs,
    async scheduleWindowEnd(instance, eventId, delayMs) {
      await enqueue(
        QUEUE_NAMES.whatsappSessionLifecycle,
        "window-end",
        { instance, eventId },
        { jobId: `window-end-${instance}-${eventId}`, delayMs },
      );
    },
    async triggerCollectionEnd(instance: string | null, eventId: string) {
      await enqueue(
        QUEUE_NAMES.whatsappSessionLifecycle,
        "collection-complete",
        { instance, eventId, reason: "collection_complete" },
        { jobId: `collection-complete-${eventId}` },
      );
    },
    async deliverQuotes(eventId) {
      // Marca o fim da coleta (idempotente) e gera os 3 cenários (fase 4).
      await admin
        .from("events")
        .update({ collection_ended_at: new Date().toISOString(), discovery_status: "completed" })
        .eq("id", eventId)
        .is("collection_ended_at", null);
      const result = await deliverEventQuotes(createDeliveryDeps(), eventId);
      logger.info({ eventId, result }, "coleta encerrada: cotações entregues");
    },
    notifyQuotationsReady,
    warn(message, context) {
      logger.warn(context, message);
    },
  };
}

/** Instância WhatsApp vinculada ao evento (null = sem sessão, ex.: simulação). */
export async function findEventInstance(eventId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.instance_name ?? null;
}

/** Prazo máximo da coleta (24h por padrão), agendado ao iniciar a descoberta. */
export async function scheduleCollectionDeadline(
  eventId: string,
  delayMs: number,
): Promise<boolean> {
  return enqueue(
    QUEUE_NAMES.whatsappSessionLifecycle,
    "collection-deadline",
    { instance: null, eventId, reason: "window_closed" },
    { jobId: `collection-deadline-${eventId}`, delayMs },
  );
}
