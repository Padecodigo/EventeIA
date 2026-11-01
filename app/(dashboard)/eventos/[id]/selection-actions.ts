"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { sendInstagramText, sendMessengerText } from "@/lib/meta/client";
import { messengerAccessToken } from "@/lib/meta/page-token";
import { formatBRL } from "@/lib/money";
import { buildSelectionMessage, relayDecision } from "@/lib/selection/relay";
import type { SelectionStatus } from "@/lib/selection/state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export interface SupplierSelectionState {
  error?: string;
  ok?: boolean;
  relayed?: boolean;
}

const selectionSchema = z.object({
  eventId: z.string().uuid(),
  supplierId: z.string().uuid(),
  optionId: z.string().uuid(),
});

async function sendToSupplier(
  channel: "instagram" | "messenger",
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; messageId: string | null }> {
  const env = serverEnv();
  const result =
    channel === "messenger"
      ? await sendMessengerText({
          accessToken: messengerAccessToken(env),
          pageId: env.META_PAGE_ID ?? "",
          recipientId,
          text,
        })
      : await sendInstagramText({
          accessToken: env.META_ACCESS_TOKEN ?? "",
          instagramBusinessId: env.META_INSTAGRAM_BUSINESS_ID ?? "",
          recipientId,
          text,
        });
  return result.ok ? { ok: true, messageId: result.messageId } : { ok: false, messageId: null };
}

/**
 * Escolhe UMA opção de produto de um fornecedor (ação explícita do usuário — o sistema
 * nunca pré-seleciona). Registra a escolha com a máquina de estados e tenta o relay ao
 * fornecedor SOMENTE dentro da janela aberta (send-guard) e em horário comercial.
 */
export async function selectSupplierOptionAction(
  _previous: SupplierSelectionState,
  formData: FormData,
): Promise<SupplierSelectionState> {
  const user = await requireUser();
  const parsed = selectionSchema.safeParse({
    eventId: formData.get("eventId"),
    supplierId: formData.get("supplierId"),
    optionId: formData.get("optionId"),
  });
  if (!parsed.success) {
    return { error: "Escolha inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,title,owner_profile_id,status")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (event.status === "canceled") {
    return { error: "Este evento foi excluído." };
  }

  const { data: option } = await supabase
    .from("supplier_options")
    .select("id,supplier_id,name,description,price_cents,unit,active")
    .eq("id", parsed.data.optionId)
    .eq("supplier_id", parsed.data.supplierId)
    .maybeSingle();
  if (option === null || option.active === false) {
    return { error: "Esta opção não existe mais." };
  }

  const { data: conversation } = await supabase
    .from("supplier_conversations")
    .select("id,channel,external_user_id,status,window_expires_at")
    .eq("event_id", event.id)
    .eq("supplier_id", parsed.data.supplierId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("supplier_selections")
    .select("id,status")
    .eq("event_id", event.id)
    .eq("supplier_id", parsed.data.supplierId)
    .maybeSingle();

  const now = new Date();
  const decision = relayDecision(
    existing?.status ?? "pendente",
    conversation !== null
      ? { status: conversation.status, windowExpiresAt: conversation.window_expires_at }
      : { status: "canal_fechado", windowExpiresAt: null },
    now,
  );

  const priceFormatted =
    option.price_cents === null ? "a combinar" : formatBRL(option.price_cents);

  const admin = getSupabaseAdmin();
  let status: SelectionStatus = decision.nextStatus;
  let relayed = false;
  const conversationId: string | null = conversation?.id ?? null;
  let relayedAt: string | null = null;

  if (decision.action === "send" && conversation !== null) {
    const { data: supplier } = await admin
      .from("suppliers")
      .select("name")
      .eq("id", parsed.data.supplierId)
      .maybeSingle();

    const message = buildSelectionMessage({
      supplierName: supplier?.name ?? "",
      eventTitle: event.title,
      optionName: option.name,
      priceFormatted,
    });

    const sent = await sendToSupplier(conversation.channel, conversation.external_user_id, message);
    if (sent.ok) {
      relayed = true;
      relayedAt = now.toISOString();
      await admin.from("supplier_conversation_messages").insert({
        conversation_id: conversation.id,
        direction: "out",
        body: message,
        external_id: sent.messageId,
      });
    } else {
      // Falha de envio: mantém pendente para nova tentativa.
      status = "pendente";
    }
  }

  const { error } = await supabase.from("supplier_selections").upsert(
    {
      event_id: event.id,
      supplier_id: parsed.data.supplierId,
      option_id: option.id,
      option_snapshot: {
        name: option.name,
        description: option.description,
        price_cents: option.price_cents,
        unit: option.unit,
      } as unknown as Json,
      status,
      chosen_by_profile_id: user.id,
      conversation_id: conversationId,
      ...(relayedAt !== null ? { relayed_at: relayedAt } : {}),
      updated_at: now.toISOString(),
    },
    { onConflict: "event_id,supplier_id" },
  );
  if (error !== null) {
    logger.error({ code: error.code }, "falha ao salvar escolha do fornecedor");
    return { error: "Não foi possível salvar a escolha. Tente novamente." };
  }

  try {
    await emitFeed(admin, {
      type: relayed ? "selection.relayed" : "selection.chosen",
      actorType: "user",
      actorId: user.id,
      aggregateType: "supplier_selection",
      aggregateId: parsed.data.supplierId,
      payload: {
        event_id: event.id,
        option_id: option.id,
        status,
        price_cents: option.price_cents,
      },
      correlationId: parsed.data.optionId,
      source: "app",
    });
  } catch {
    // feed não bloqueia a escolha
  }

  revalidatePath(`/eventos/${event.id}`);
  return { ok: true, relayed };
}
