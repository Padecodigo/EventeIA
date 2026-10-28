import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Tipos gerados ainda não conhecem analytics_events (migração 0057). */
interface AnalyticsQueryDb {
  from(table: "analytics_events"): {
    select(columns: string): {
      gte(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(n: number): Promise<{ data: AnalyticsRow[] | null }>;
        };
      };
    };
    delete(): {
      lt(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

export interface AnalyticsRow {
  event: "page_view" | "login" | "signup";
  path: string | null;
  session_id: string | null;
  created_at: string;
}

function db(): AnalyticsQueryDb {
  return getSupabaseAdmin() as unknown as AnalyticsQueryDb;
}

/** Carrega os eventos desde `sinceIso` (ordem decrescente). */
export async function loadAnalyticsSince(sinceIso: string, limit = 20_000): Promise<AnalyticsRow[]> {
  const { data } = await db()
    .from("analytics_events")
    .select("event,path,session_id,created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
