import "server-only";

import { kickoffDiscovery } from "@/lib/discovery/kickoff-runtime";
import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { ConfirmByDmPorts } from "./confirm-by-dm";

const ATTEMPT_TTL_SECONDS = 3600;
const attemptKey = (senderId: string) => `eventeia:event-confirm:fail:${senderId}`;

/** Portas de produção (service_role + Redis) da confirmação por DM; `reply` vem do chamador. */
export function createConfirmByDmPorts(reply: (text: string) => Promise<unknown>): ConfirmByDmPorts {
  const admin = getSupabaseAdmin();
  return {
    async findByCode(code) {
      const { data } = await admin
        .from("events")
        .select("id,title,status,confirmed_at,user_deleted_at")
        .eq("confirmation_code", code)
        .maybeSingle();
      if (data === null) return null;
      return {
        id: data.id,
        title: data.title,
        status: data.status,
        confirmedAt: data.confirmed_at,
        deleted: data.user_deleted_at !== null,
      };
    },
    async markConfirmed(eventId) {
      const { data } = await admin
        .from("events")
        .update({ confirmed_at: new Date().toISOString() })
        .eq("id", eventId)
        .is("confirmed_at", null)
        .select("id");
      return (data ?? []).length > 0;
    },
    kickoff: (eventId) => kickoffDiscovery(eventId),
    async failedAttempts(senderId) {
      const raw = await getRedisConnection().get(attemptKey(senderId));
      return raw === null ? 0 : Number(raw) || 0;
    },
    async recordFailedAttempt(senderId) {
      const conn = getRedisConnection();
      const total = await conn.incr(attemptKey(senderId));
      if (total === 1) await conn.expire(attemptKey(senderId), ATTEMPT_TTL_SECONDS);
      return total;
    },
    reply,
    log: (message, context) => logger.info(context, message),
  };
}
