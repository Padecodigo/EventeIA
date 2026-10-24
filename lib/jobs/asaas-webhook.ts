import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface AsaasWebhookJob {
  webhookEventId: string;
}

/**
 * Processa um webhook Asaas registrado em `webhook_events`.
 * A atomicidade (pagamento + tíquete + créditos + feeds) vive na função SQL
 * `process_payment_webhook` — ver supabase/migrations/0003_functions.sql.
 */
export async function handleAsaasWebhookJob(data: AsaasWebhookJob): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: result, error } = await admin.rpc("process_payment_webhook", {
    p_webhook_event_id: data.webhookEventId,
  });

  if (error !== null) {
    throw new Error(`process_payment_webhook falhou: ${error.message}`);
  }

  logger.info({ webhookEventId: data.webhookEventId, result }, "webhook asaas processado");

  if (result === "not_found") {
    throw new Error(`webhook_events não encontrado: ${data.webhookEventId}`);
  }
}
