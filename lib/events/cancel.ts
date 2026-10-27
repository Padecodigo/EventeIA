import { cancelAsaasPayment } from "@/lib/asaas/client";
import { removeScheduledEventJobs, stopEventBackgroundWork } from "@/lib/events/stop";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface CancelEventFollowUpInput {
  eventId: string;
  ownerProfileId: string;
  actorId: string;
  /** Quem pediu: o cliente no próprio evento ou um admin no painel. */
  actorType: "user" | "admin";
}

/**
 * Efeitos colaterais de tirar um evento de circulação (soft delete).
 *
 * O status `canceled` é gravado por quem chama, com o cliente adequado à
 * autorização (RLS do dono, ou service_role do admin); aqui ficam só as
 * consequências: Pix em aberto não pode ser pago depois, disparos param, jobs
 * agendados somem e o feed registra o cancelamento.
 *
 * É tolerante a repetição: um Pix que o Asaas já cancelou apenas gera log.
 */
export async function cancelEventFollowUp(input: CancelEventFollowUpInput): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: openPayments } = await admin
    .from("payments")
    .select("id,asaas_payment_id")
    .eq("event_id", input.eventId)
    .eq("purpose", "event_ticket")
    .in("status", ["pending", "overdue"]);

  for (const payment of openPayments ?? []) {
    try {
      await cancelAsaasPayment(payment.asaas_payment_id);
      await admin.from("payments").update({ status: "canceled" }).eq("id", payment.id);
      try {
        await emitFeed(admin, {
          type: "payment.canceled",
          actorType: input.actorType,
          actorId: input.actorId,
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: { event_id: input.eventId },
          correlationId: input.eventId,
          source: "app",
        });
      } catch {
        // feed não bloqueia o cancelamento
      }
    } catch (caught) {
      logger.warn(
        {
          paymentId: payment.id,
          reason: caught instanceof Error ? caught.message : "desconhecido",
        },
        "não foi possível cancelar o Pix do evento excluído",
      );
    }
  }

  await stopEventBackgroundWork(input.eventId);
  await removeScheduledEventJobs(input.eventId, input.ownerProfileId);

  try {
    await emitFeed(admin, {
      type: "event.canceled",
      actorType: input.actorType,
      actorId: input.actorId,
      aggregateType: "event",
      aggregateId: input.eventId,
      payload: {},
      correlationId: input.eventId,
      source: "app",
    });
  } catch {
    // feed não bloqueia a exclusão
  }
}
