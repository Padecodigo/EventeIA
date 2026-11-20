import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { summarizeWebhookPayload } from "./page-webhooks";

export interface MetaWebhookLogEntry {
  id: string;
  externalEventId: string;
  status: "received" | "processing" | "processed" | "failed";
  receivedAt: string;
  processedAt: string | null;
  lastError: string | null;
  summary: ReturnType<typeof summarizeWebhookPayload>;
}

export async function listRecentMetaWebhookEvents(limit = 20): Promise<MetaWebhookLogEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("webhook_events")
    .select("id,external_event_id,payload,status,received_at,processed_at,last_error")
    .eq("source", "meta" as unknown as "whatsapp_cloud")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao listar webhooks meta");
    return [];
  }

  const rows = data ?? [];
  return rows.map((row) => ({
    id: row.id,
    externalEventId: row.external_event_id,
    status: row.status,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
    summary: summarizeWebhookPayload(row.payload),
  }));
}
