import "server-only";

import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { enqueueQuoteExtraction } from "@/lib/quotes/runtime";
import { detectOptOut } from "@/lib/schemas/whatsapp";
import type { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsappChannel } from "@/lib/whatsapp/channel";
import { renderOptOutConfirmation } from "@/lib/whatsapp/templates";

/**
 * Pipeline de entrada agnóstico de canal (Evolution e Cloud API).
 * Cada webhook converte seu payload nestes eventos canônicos e chama
 * `processInboundEvents` — status de entrega, respostas, opt-out e extração
 * de cotações seguem exatamente o mesmo caminho.
 */
export type InboundEvent =
  | { kind: "message"; messageId: string | undefined; phone: string; text: string }
  | { kind: "status"; messageId: string; status: "sent" | "delivered" | "read" | "failed" };

type Admin = ReturnType<typeof getSupabaseAdmin>;

const PROVIDER_LABEL: Record<WhatsappChannel, string> = {
  evolution: "Evolution",
  cloud: "WhatsApp Cloud API",
};

export async function processInboundEvents(
  admin: Admin,
  events: readonly InboundEvent[],
  ctx: { channel: WhatsappChannel; correlationId: string },
): Promise<void> {
  for (const event of events) {
    if (event.kind === "status") {
      await applyStatus(admin, event, ctx.channel);
    } else {
      await applyMessage(admin, event, ctx);
    }
  }
}

async function applyStatus(
  admin: Admin,
  event: Extract<InboundEvent, { kind: "status" }>,
  channel: WhatsappChannel,
): Promise<void> {
  const { status } = event;
  const now = new Date().toISOString();
  const update =
    status === "failed"
      ? { status, failed_at: now, error: `falha reportada pela ${PROVIDER_LABEL[channel]}` }
      : status === "delivered"
        ? { status, delivered_at: now }
        : status === "read"
          ? { status, read_at: now }
          : { status };

  await admin
    .from("whatsapp_messages")
    .update(update)
    .eq("external_message_id", event.messageId)
    .in("status", ["sent", "delivered"]);
}

async function applyMessage(
  admin: Admin,
  event: Extract<InboundEvent, { kind: "message" }>,
  ctx: { channel: WhatsappChannel; correlationId: string },
): Promise<void> {
  const { phone, text } = event;
  // Fase 3: vincula a resposta ao fornecedor contatado mais recente (evento em coleta).
  const { data: prospectRow } = await admin
    .from("vendor_prospects")
    .select("id,event_id")
    .eq("phone_e164", phone)
    .in("status", ["sent", "replied"])
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  await admin.from("whatsapp_messages").upsert(
    {
      direction: "inbound",
      template: "inbound",
      to_number_e164: phone,
      body: text.slice(0, 4000),
      status: "delivered",
      channel: ctx.channel,
      idempotency_key: `inbound:${event.messageId ?? ctx.correlationId}`,
      ...(prospectRow !== null
        ? { event_id: prospectRow.event_id, prospect_id: prospectRow.id }
        : {}),
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  // Regra 3 — opt-out (sair, parar, não tenho interesse…), sem acento/caixa.
  if (detectOptOut(text)) {
    await admin.from("consents").upsert(
      {
        phone_e164: phone,
        channel: "whatsapp",
        status: "opted_out",
        source: "whatsapp_inbound",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_e164,channel" },
    );
    void renderOptOutConfirmation();
    // Opt-out GLOBAL: o fornecedor sai do cache de descoberta para sempre.
    await admin
      .from("suppliers")
      .update({ opt_out_at: new Date().toISOString() })
      .eq("phone_e164", phone)
      .is("opt_out_at", null);

    const { data: optedOut } = await admin
      .from("vendor_prospects")
      .update({ status: "opt_out", opt_out_at: new Date().toISOString() })
      .eq("phone_e164", phone)
      .in("status", ["pending", "sent", "replied", "failed"])
      .select("id,event_id");

    for (const row of optedOut ?? []) {
      try {
        await emitFeed(admin, {
          type: "vendor.opt_out",
          actorType: "system",
          aggregateType: "event",
          aggregateId: row.event_id,
          payload: { prospect_id: row.id },
          correlationId: ctx.correlationId,
          source: "webhook",
        });
      } catch {
        // feed não bloqueia o opt-out
      }
    }
    logger.info({ phoneMasked: `${phone.slice(0, 5)}…` }, "opt-out registrado");
    return;
  }

  await admin
    .from("vendor_prospects")
    .update({ status: "replied", last_message_at: new Date().toISOString() })
    .eq("phone_e164", phone)
    .eq("status", "sent");
  if (prospectRow !== null) {
    await enqueueQuoteExtraction(prospectRow.event_id, prospectRow.id);
  }
}
