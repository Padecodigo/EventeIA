import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Flag do autopilot de **publicidade** (não afeta a prospecção). */
export const AUTOPILOT_KEY = "marketing_autopilot";

interface SettingsDb {
  from(table: "app_settings"): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): Promise<{ data: { value: unknown } | null }> };
    };
    upsert(values: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: unknown }>;
  };
}

function db(): SettingsDb {
  return getSupabaseAdmin() as unknown as SettingsDb;
}

export interface AutopilotState {
  enabled: boolean;
  updatedAt: string | null;
}

export async function getAutopilotState(): Promise<AutopilotState> {
  const { data } = await db().from("app_settings").select("value").eq("key", AUTOPILOT_KEY).maybeSingle();
  const value = (data?.value ?? {}) as { enabled?: unknown; updatedAt?: unknown };
  return {
    enabled: value.enabled === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export async function isAutopilotEnabled(): Promise<boolean> {
  return (await getAutopilotState()).enabled;
}

export async function setAutopilotEnabled(enabled: boolean): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: AUTOPILOT_KEY, value: { enabled, updatedAt: new Date().toISOString() } }, { onConflict: "key" });
  if (error !== null) throw new Error("falha ao salvar o autopilot");
}
