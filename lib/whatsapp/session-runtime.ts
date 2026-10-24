import "server-only";

import { logoutInstance } from "@/lib/evolution-api/client";
import { logger } from "@/lib/logger";
import { notifyQuotationsReady } from "@/lib/notifications/runtime";
import { enqueue, getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
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
          ...(extra?.drainAtMs !== undefined ? { drain_at: new Date(extra.drainAtMs).toISOString() } : {}),
          ...(state === "disconnected" ? { disconnected_at: nowIso } : {}),
        })
        .eq("instance_name", instance);
    },
    logout: logoutInstance,
    async pauseEventJobs(eventId) {
      await getRedisConnection().set(eventPausedKey(eventId), "1", "EX", EVENT_PAUSE_TTL_SECONDS);
    },
    async scheduleWindowEnd(instance, eventId, delayMs) {
      await enqueue(
        QUEUE_NAMES.whatsappSessionLifecycle,
        "window-end",
        { instance, eventId },
        { jobId: `window-end-${instance}-${eventId}`, delayMs },
      );
    },
    notifyQuotationsReady,
    warn(message, context) {
      logger.warn(context, message);
    },
  };
}
