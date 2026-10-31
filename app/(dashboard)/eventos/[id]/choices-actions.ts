"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { parseQuotationOptions, resolveChoiceOption } from "@/lib/quotes/choices";
import {
  CONTACT_HANDOFF_CONSENT_VERSION,
  contactHandoffConsentText,
} from "@/lib/quotes/handoff";
import { deliverContactHandoff } from "@/lib/quotes/handoff-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export interface QuotationChoiceState {
  error?: string;
  ok?: boolean;
  relayed?: boolean;
  handoffStatus?: "repassado" | "link" | "unavailable" | "sem_consent";
  fallbackUrl?: string | null;
  handoffMessage?: string;
}

const choiceSchema = z.object({
  eventId: z.string().uuid(),
  quotationId: z.string().uuid(),
  optionIndex: z.coerce.number().int().min(0).max(14),
});

/**
 * Escolhe UMA opção/pacote de uma cotação (ex.: "Pacote prata" x "Pacote ouro").
 * Registra a escolha (snapshot). A escolha continua salva mesmo sem aviso ao fornecedor.
 *
 * O contato do usuário só é repassado ao fornecedor se o checkbox de consentimento
 * LGPD vier marcado; o aceite é registrado (texto + versão + instante, sem IP) antes
 * de qualquer envio.
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

  const consentGiven = formData.get("consent") === "on";
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
    .select("id,event_id,supplier_id,vendor_name,vendor_contact,status,extraction")
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

  if (!consentGiven) {
    revalidatePath(`/eventos/${event.id}`);
    return {
      ok: true,
      relayed: false,
      handoffStatus: "sem_consent",
      handoffMessage:
        "Escolha registrada. Para compartilhar seu contato com o fornecedor, marque a autorização e escolha novamente.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name,email,phone_e164,contact_whatsapp_e164,instagram_handle")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError !== null || profile === null) {
    return { error: "Não foi possível carregar seu contato. Tente novamente." };
  }

  const consentText = contactHandoffConsentText(quotation.vendor_name);
  const { data: consent, error: consentError } = await supabase
    .from("contact_handoff_consents")
    .upsert(
      {
        event_id: event.id,
        quotation_id: quotation.id,
        supplier_id: quotation.supplier_id,
        profile_id: user.id,
        consent_text: consentText,
        consent_version: CONTACT_HANDOFF_CONSENT_VERSION,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "quotation_id,profile_id" },
    )
    .select("id")
    .single();
  if (consentError !== null || consent === null) {
    logger.error({ code: consentError?.code }, "falha ao registrar consentimento de repasse");
    return { error: "Não foi possível registrar a autorização. Tente novamente." };
  }

  try {
    const result = await deliverContactHandoff({
      consentId: consent.id,
      eventId: event.id,
      quotationId: quotation.id,
      supplierId: quotation.supplier_id,
      profileId: user.id,
      supplierName: quotation.vendor_name,
      supplierContact: quotation.vendor_contact,
      eventTitle: event.title,
      optionName: option.name,
      profile: {
        displayName: profile.display_name,
        email: profile.email,
        phone: profile.phone_e164,
        whatsapp: profile.contact_whatsapp_e164,
        instagramHandle: profile.instagram_handle,
      },
    });

    revalidatePath(`/eventos/${event.id}`);
    return {
      ok: true,
      relayed: result.status === "repassado",
      handoffStatus: result.status,
      fallbackUrl: result.fallbackUrl,
      handoffMessage: result.message,
    };
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao repassar contato ao fornecedor",
    );
    revalidatePath(`/eventos/${event.id}`);
    return {
      ok: true,
      relayed: false,
      handoffStatus: "unavailable",
      handoffMessage:
        "A escolha foi registrada, mas não foi possível repassar seu contato agora. Você pode seguir com outros fornecedores.",
    };
  }
}
