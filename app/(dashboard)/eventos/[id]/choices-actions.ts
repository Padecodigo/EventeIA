"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { parseQuotationOptions, resolveChoiceOption } from "@/lib/quotes/choices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export interface QuotationChoiceState {
  error?: string;
  ok?: boolean;
  relayed?: boolean;
}

const choiceSchema = z.object({
  eventId: z.string().uuid(),
  quotationId: z.string().uuid(),
  optionIndex: z.coerce.number().int().min(0).max(14),
});

/**
 * Escolhe UMA opção/pacote de uma cotação (ex.: "Pacote prata" x "Pacote ouro").
 * Registra a escolha (snapshot) e tenta avisar o fornecedor pelo canal do evento
 * (Cloud API ou Evolution). Se o aviso falhar, a escolha continua salva — o usuário
 * pode falar com o fornecedor pelo link direto no painel.
 */
export async function chooseQuotationOptionAction(
  _previous: QuotationChoiceState,
  formData: FormData,
): Promise<QuotationChoiceState> {
  const user = await requireUser();
  const parsed = choiceSchema.safeParse({
    eventId: formData.get("eventId"),
    quotationId: formData.get("quotationId"),
    optionIndex: formData.get("optionIndex"),
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

  const { data: quotation } = await supabase
    .from("quotations")
    .select("id,event_id,vendor_name,vendor_contact,status,extraction")
    .eq("id", parsed.data.quotationId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (quotation === null) {
    return { error: "Cotação não encontrada." };
  }
  if (quotation.status !== "draft") {
    return { error: "Esta cotação não está mais em aberto." };
  }

  const option = resolveChoiceOption(
    parseQuotationOptions(quotation.extraction),
    parsed.data.optionIndex,
  );
  if (option === null) {
    return { error: "Esta opção não existe mais." };
  }

  const { error } = await supabase.from("quotation_choices").upsert(
    {
      event_id: event.id,
      quotation_id: quotation.id,
      option_index: parsed.data.optionIndex,
      option_snapshot: option as unknown as Json,
      chosen_by_profile_id: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "quotation_id" },
  );
  if (error !== null) {
    logger.error({ code: error.code }, "falha ao salvar escolha da cotação");
    return { error: "Não foi possível salvar a escolha. Tente novamente." };
  }

  try {
    await emitFeed(getSupabaseAdmin(), {
      type: "quotation.chosen",
      actorType: "user",
      actorId: user.id,
      aggregateType: "quotation",
      aggregateId: quotation.id,
      payload: {
        event_id: event.id,
        option_index: parsed.data.optionIndex,
        amount_cents: option.amount_cents,
      },
      correlationId: quotation.id,
      source: "app",
    });
  } catch {
    // feed não bloqueia a escolha
  }

  // WhatsApp removido: não há relay ao fornecedor.
  const relayed = false;

  revalidatePath(`/eventos/${event.id}`);
  return { ok: true, relayed };
}
