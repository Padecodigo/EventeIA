import "server-only";

import { getAsaasPayment } from "@/lib/asaas/client";
import { classifyAsaasEvent } from "@/lib/asaas/webhook";
import { isConfigured, serverEnv } from "@/lib/env";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Mapeia status do Asaas para nome de evento de webhook. */
const STATUS_TO_EVENT: Record<string, string> = {
  RECEIVED: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_CONFIRMED",
  OVERDUE: "PAYMENT_OVERDUE",
  REFUNDED: "PAYMENT_REFUNDED",
  AWAITING_RISK_ANALYSIS: "PAYMENT_AWAITING_RISK_ANALYSIS",
};

/**
 * Conciliação diária (.context/PAYMENTS.md §8): compara pagamentos locais
 * pendentes/vencidos (com mais de 24h) com o Asaas. Divergência de status
 * entra pelo mesmo caminho idempotente do webhook.
 */
export async function runAsaasReconcileSweep(): Promise<number> {
  const env = serverEnv();

  if (!isConfigured(env.ASAAS_API_KEY)) {
    logger.info("conciliação ignorada: ASAAS_API_KEY não configurada");
    return 0;
  }

  const admin = getSupabaseAdmin();
  const cutoffIso = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const { data: payments, error } = await admin
    .from("payments")
    .select("id,asaas_payment_id,status")
    .in("status", ["pending", "overdue"])
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error !== null) {
    throw new Error(`conciliação falhou ao listar pagamentos: ${error.message}`);
  }

  let reconciled = 0;

  for (const payment of payments ?? []) {
    try {
      const remote = await getAsaasPayment(payment.asaas_payment_id);
      const eventName = STATUS_TO_EVENT[remote.status.toUpperCase()] ?? null;

      if (eventName === null) {
        continue;
      }

      const classification = classifyAsaasEvent(eventName);
      if (classification === null || classification.status === payment.status) {
        continue;
      }

      const externalEventId = `reconcile:${payment.asaas_payment_id}:${remote.status}`;

      const { data: inserted } = await admin
        .from("webhook_events")
        .upsert(
          {
            source: "asaas",
            external_event_id: externalEventId,
            payload: {
              event: eventName,
              payment: { id: remote.id, status: remote.status, subscription: remote.subscription },
            },
            status: "received",
          },
          { onConflict: "source,external_event_id", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();

      if (inserted === null) {
        continue;
      }

      const { data: result } = await admin.rpc("process_payment_webhook", {
        p_webhook_event_id: inserted.id,
      });

      if (result === "processed") {
        reconciled += 1;

        try {
          await emitFeed(admin, {
            type: "payment.reconciled",
            actorType: "system",
            aggregateType: "payment",
            aggregateId: payment.id,
            payload: { from: payment.status, to: classification.status },
            correlationId: externalEventId,
            source: "worker",
          });
        } catch {
          // feed não bloqueia a conciliação
        }
      }
    } catch (caught) {
      logger.warn(
        { asaasPaymentId: payment.asaas_payment_id, reason: caught instanceof Error ? caught.message : "desconhecido" },
        "conciliação: falha ao consultar pagamento",
      );
    }
  }

  logger.info({ reconciled }, "conciliação diária concluída");
  return reconciled;
}
