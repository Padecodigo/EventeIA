import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { kickoffDiscoveryIfReady, type KickoffResult } from "./kickoff";
import { startDiscovery } from "./runtime";

/** Versão de produção (service_role) de `kickoffDiscoveryIfReady`. */
export function kickoffDiscovery(eventId: string): Promise<KickoffResult> {
  const admin = getSupabaseAdmin();
  return kickoffDiscoveryIfReady(
    {
      async loadEvent(id) {
        const { data } = await admin
          .from("events")
          .select("status,interview_completed_at")
          .eq("id", id)
          .maybeSingle();
        return data === null
          ? null
          : { status: data.status, interviewCompleted: data.interview_completed_at !== null };
      },
      startDiscovery,
      warn: (message, context) => logger.warn(context, message),
    },
    eventId,
  );
}
