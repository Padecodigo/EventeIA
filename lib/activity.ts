import "server-only";

import {
  activityDetailFromPayload,
  activityLabel,
  type ActivityItem,
} from "./activity/pure";
import { getSupabaseAdmin } from "./supabase/admin";

export type { ActivityItem };

/** Histórico recente do usuário (eventos, pagamentos, cotações, créditos, consentimentos). */
export async function getUserActivity(userId: string, limit = 10): Promise<ActivityItem[]> {
  try {
    const admin = getSupabaseAdmin();

    const [eventsResult, paymentsResult, workspacesResult, testimonialsResult] = await Promise.all([
      admin.from("events").select("id").eq("owner_profile_id", userId),
      admin.from("payments").select("id").eq("profile_id", userId),
      admin.from("workspaces").select("id").eq("owner_id", userId),
      admin.from("testimonials").select("id").eq("profile_id", userId),
    ]);

    const eventIds = (eventsResult.data ?? []).map((row) => row.id);
    const quotationIds =
      eventIds.length > 0
        ? (
            await admin
              .from("quotations")
              .select("id")
              .in("event_id", eventIds)
          ).data?.map((row) => row.id) ?? []
        : [];

    const aggregateIds = new Set<string>([
      ...eventIds,
      ...(paymentsResult.data ?? []).map((row) => row.id),
      ...(workspacesResult.data ?? []).map((row) => row.id),
      ...(testimonialsResult.data ?? []).map((row) => row.id),
      ...quotationIds,
    ]);

    const { data, error } = await admin
      .from("system_events")
      .select("id,type,occurred_at,payload,aggregate_id,actor_id")
      .order("occurred_at", { ascending: false })
      .limit(120);

    if (error !== null || data === null) {
      return [];
    }

    return data
      .filter((event) => event.actor_id === userId || aggregateIds.has(event.aggregate_id))
      .slice(0, limit)
      .map((event) => ({
        id: event.id,
        type: event.type,
        label: activityLabel(event.type),
        detail: activityDetailFromPayload(event.payload),
        occurredAt: event.occurred_at,
      }));
  } catch {
    return [];
  }
}
