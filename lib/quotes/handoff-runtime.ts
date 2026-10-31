import "server-only";

import { logger } from "@/lib/logger";
import { getEmailAdapter } from "@/lib/notifications/email";
import { sendChatToSupplier } from "@/lib/outreach/chat-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  buildHandoffContact,
  contactHandoffFallbackUrl,
  isContactHandoffConsentValid,
  normalizeInstagramHandle,
  normalizePublicEmail,
  planContactHandoff,
  renderContactHandoffMessage,
  type HandoffConversation,
  type HandoffPlan,
  type HandoffProfile,
} from "./handoff";

/**
 * Executa o repasse do contato ao fornecedor. Só roda com um consentimento
 * previamente gravado em `contact_handoff_consents` (o id é a prova). Sem ele,
 * lança antes de qualquer envio — nenhum dado pessoal sai.
 */
export interface ContactHandoffInput {
  consentId: string;
  eventId: string;
  quotationId: string;
  supplierId: string | null;
  profileId: string;
  supplierName: string;
  supplierContact: string | null;
  eventTitle: string;
  optionName: string | null;
  profile: HandoffProfile;
  now?: Date;
}

export type ContactHandoffStatus = "repassado" | "link" | "unavailable";

export interface ContactHandoffResult {
  status: ContactHandoffStatus;
  channel: "instagram" | "messenger" | "email" | "link" | null;
  fallbackUrl: string | null;
  message: string;
}

interface ConversationRow {
  id: string;
  channel: "instagram" | "messenger";
  external_user_id: string;
  status: "open" | "canal_fechado" | "opted_out";
  window_expires_at: string | null;
}

function toConversation(row: ConversationRow): HandoffConversation {
  return {
    id: row.id,
    channel: row.channel,
    externalUserId: row.external_user_id,
    status: row.status,
    windowExpiresAt: row.window_expires_at,
  };
}

function wasWindowExpired(conversation: HandoffConversation, now: Date): boolean {
  if (conversation.status !== "open") return false;
  if (conversation.windowExpiresAt === null) return false;
  const expiresAt = new Date(conversation.windowExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && now.getTime() > expiresAt.getTime();
}

export async function deliverContactHandoff(
  input: ContactHandoffInput,
): Promise<ContactHandoffResult> {
  const now = input.now ?? new Date();
  const admin = getSupabaseAdmin();

  const { data: consent } = await admin
    .from("contact_handoff_consents")
    .select("id,event_id,quotation_id,supplier_id,profile_id,accepted_at")
    .eq("id", input.consentId)
    .maybeSingle();

  if (
    consent === null ||
    consent.event_id !== input.eventId ||
    consent.quotation_id !== input.quotationId ||
    // O aceite é POR FORNECEDOR: um consentimento para outro fornecedor não vale.
    consent.supplier_id !== input.supplierId ||
    consent.profile_id !== input.profileId ||
    !isContactHandoffConsentValid({ acceptedAt: consent.accepted_at })
  ) {
    throw new Error("consentimento de repasse ausente ou inválido");
  }

  let supplierEmail = normalizePublicEmail(input.supplierContact);
  if (input.supplierId !== null) {
    const { data: supplier } = await admin
      .from("suppliers")
      .select("contact_email")
      .eq("id", input.supplierId)
      .maybeSingle();
    supplierEmail = normalizePublicEmail(supplier?.contact_email) ?? supplierEmail;
  }
  const supplierHandle = normalizeInstagramHandle(input.supplierContact);

  let conversations: HandoffConversation[] = [];
  if (input.supplierId !== null) {
    const { data } = await admin
      .from("supplier_conversations")
      .select("id,channel,external_user_id,status,window_expires_at")
      .eq("event_id", input.eventId)
      .eq("supplier_id", input.supplierId)
      .order("last_inbound_at", { ascending: false });
    conversations = ((data ?? []) as ConversationRow[]).map(toConversation);
  }

  const plans = conversations.map((conversation) =>
    planContactHandoff({
      now,
      eventId: input.eventId,
      conversation,
      supplierEmail,
      supplierHandle,
    }),
  );
  let plan: HandoffPlan =
    plans.find((candidate) => candidate.mode === "meta") ??
    plans.find((candidate) => candidate.mode === "email") ??
    plans.find((candidate) => candidate.mode === "link") ??
    plans[0] ??
    planContactHandoff({
      now,
      eventId: input.eventId,
      conversation: null,
      supplierEmail,
      supplierHandle,
    });

  const expired = conversations.find((conversation) => wasWindowExpired(conversation, now));
  if (expired !== undefined) {
    await admin
      .from("supplier_conversations")
      .update({ status: "canal_fechado", updated_at: now.toISOString() })
      .eq("id", expired.id);
  }

  const contact = buildHandoffContact(input.profile);

  if (plan.mode === "meta") {
    const text = renderContactHandoffMessage({
      vendorName: input.supplierName,
      eventTitle: input.eventTitle,
      optionName: input.optionName,
      contact,
    });
    const sent = await sendChatToSupplier({
      channel: plan.conversation.channel,
      recipientId: plan.conversation.externalUserId,
      text,
    });

    if (sent.ok) {
      const { error } = await admin.from("supplier_conversation_messages").insert({
        conversation_id: plan.conversation.id,
        direction: "out",
        body: text,
        moderated: false,
        external_id: sent.messageId,
        author: "system",
      });
      if (error !== null) {
        logger.error({ code: error.code }, "falha ao registrar repasse de contato");
      }
      await admin
        .from("supplier_conversations")
        .update({ updated_at: now.toISOString() })
        .eq("id", plan.conversation.id);

      await markDelivered(admin, input, "repassado", plan.conversation.channel, now);
      return {
        status: "repassado",
        channel: plan.conversation.channel,
        fallbackUrl: null,
        message:
          "Escolha registrada: seu contato foi repassado ao fornecedor. A partir daqui, o atendimento segue diretamente entre vocês.",
      };
    }

    // A Meta recusou o envio: cai para e-mail/link sem expor contato a mais ninguém.
    plan = planContactHandoff({
      now,
      eventId: input.eventId,
      conversation: null,
      supplierEmail,
      supplierHandle,
    });
  }

  if (plan.mode === "email") {
    const text = renderContactHandoffMessage({
      vendorName: input.supplierName,
      eventTitle: input.eventTitle,
      optionName: input.optionName,
      contact,
    });
    try {
      await getEmailAdapter().send({
        to: plan.to,
        subject: `Contato do cliente — ${input.eventTitle}`,
        text,
        eventId: input.eventId,
      });
      await markDelivered(admin, input, "repassado", "email", now);
      return {
        status: "repassado",
        channel: "email",
        fallbackUrl: null,
        message:
          "Escolha registrada: seu contato foi enviado ao fornecedor por e-mail. A partir daqui, o atendimento segue diretamente entre vocês.",
      };
    } catch (error) {
      logger.error(
        { reason: error instanceof Error ? error.message : "desconhecido" },
        "falha ao enviar repasse de contato por e-mail",
      );
      plan = planContactHandoff({
        now,
        eventId: input.eventId,
        conversation: null,
        supplierEmail: null,
        supplierHandle,
      });
    }
  }

  if (plan.mode === "link") {
    await markConsentDelivery(admin, input, {
      deliveryStatus: "link",
      channel: "link",
      fallbackUrl: plan.url,
      now,
    });
    return {
      status: "link",
      channel: "link",
      fallbackUrl: plan.url,
      message:
        "O canal direto com este fornecedor está fechado agora. Use o link para falar com ele no Instagram; a escolha continua salva.",
    };
  }

  const fallbackUrl = contactHandoffFallbackUrl({
    eventId: input.eventId,
    supplierHandle,
  });
  const optedOut = plan.mode === "unavailable" && plan.reason === "opted_out";
  await markConsentDelivery(admin, input, {
    deliveryStatus: optedOut ? "indisponivel" : "canal_fechado",
    channel: null,
    fallbackUrl,
    now,
  });
  return {
    status: "unavailable",
    channel: null,
    fallbackUrl,
    message: optedOut
      ? "O fornecedor pediu para não receber mensagens. Você pode seguir com outros fornecedores."
      : "Não foi possível repassar seu contato agora. Você pode seguir com outros fornecedores.",
  };
}

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

async function markDelivered(
  admin: AdminClient,
  input: ContactHandoffInput,
  status: "repassado",
  channel: "instagram" | "messenger" | "email",
  now: Date,
): Promise<void> {
  await markConsentDelivery(admin, input, {
    deliveryStatus: status,
    channel,
    fallbackUrl: null,
    now,
  });
  await admin
    .from("quotations")
    .update({
      status: "repassado",
      repassado_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", input.quotationId);
}

async function markConsentDelivery(
  admin: AdminClient,
  input: ContactHandoffInput,
  delivery: {
    deliveryStatus: "repassado" | "link" | "canal_fechado" | "indisponivel";
    channel: "instagram" | "messenger" | "email" | "link" | null;
    fallbackUrl: string | null;
    now: Date;
  },
): Promise<void> {
  await admin
    .from("contact_handoff_consents")
    .update({
      delivery_status: delivery.deliveryStatus,
      delivery_channel: delivery.channel,
      delivered_at: delivery.deliveryStatus === "repassado" ? delivery.now.toISOString() : null,
      fallback_url: delivery.fallbackUrl,
      updated_at: delivery.now.toISOString(),
    })
    .eq("id", input.consentId);
}
