import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Tipos gerados ainda não conhecem analytics_events (migração 0057). */
interface AnalyticsDb {
  from(table: "analytics_events"): {
    insert(values: Record<string, unknown>): Promise<{ error: unknown }>;
  };
}

export type AnalyticsEvent = "page_view" | "login" | "signup";

/** Registra um evento de analytics (falha não bloqueia o fluxo principal). */
export async function recordAnalytics(input: {
  event: AnalyticsEvent;
  profileId?: string | null;
  path?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const db = getSupabaseAdmin() as unknown as AnalyticsDb;
    await db
      .from("analytics_events")
      .insert({
        event: input.event,
        profile_id: input.profileId ?? null,
        path: input.path ?? null,
        session_id: input.sessionId ?? null,
      });
  } catch (error) {
    logger.warn({ error: String(error), event: input.event }, "falha ao registrar analytics");
  }
}
