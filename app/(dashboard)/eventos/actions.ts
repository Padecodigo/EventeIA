"use server";

import { isEventStarted } from "@/lib/events/edit-lock";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import {
  AsaasNotConfiguredError,
  createAsaasCardPayment,
  createAsaasCustomer,
  createAsaasPixPayment,
} from "@/lib/asaas/client";
import { requireUser } from "@/lib/auth";
import { finalPriceCents, normalizeCouponCode } from "@/lib/coupons/pure";
import { kickoffDiscovery } from "@/lib/discovery/kickoff-runtime";
import { ENGINE_VERSION } from "@/lib/engine";
import { serverEnv } from "@/lib/env";
import { parseBudgetLimitInput } from "@/lib/events/budget-limit";
import { emitFeed } from "@/lib/feeds";
import { findMunicipioByCode, regionForUf } from "@/lib/geo/municipios";
import { recordTermsAcceptance } from "@/lib/legal/acceptance-server";
import { TERMS_ERROR, hasAcceptedTerms } from "@/lib/legal/terms";
import { logger } from "@/lib/logger";
import { luckyDiscountCents } from "@/lib/lucky/pure";
import { reserveLuckyCoupon } from "@/lib/lucky/server";
import { parseBRLToCents } from "@/lib/money";
import {
  COUPON_REFUSAL,
  previewCheckoutDiscount,
  resolveCheckoutDiscount,
} from "@/lib/offers/checkout";
import { attachUserOffer, releaseUserOffer } from "@/lib/offers/server";
import { canEditSearchStart, parseSearchStartInput } from "@/lib/search-start";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
}

const createEventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  eventType: z.enum([
    "festa_infantil",
    "quinze_anos",
    "casamento",
    "aniversario",
    "corporativo",
    "batizado",
    "formatura",
  ]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Legado (formulário antigo): só a faixa regional. Novo: município IBGE. */
  region: z.enum(["sp", "rj", "mg", "outros"]).optional(),
  cityCode: z.coerce.number().int().min(1000000).max(9999999).optional(),
  guestCount: z.coerce.number().int().min(1).max(5000),
});

function emptyToUndefined(value: FormDataEntryValue | null): FormDataEntryValue | undefined {
  return value === null || value === "" ? undefined : value;
}

export async function createEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    region: formData.get("region") ?? undefined,
    cityCode: emptyToUndefined(formData.get("cityCode")),
    guestCount: formData.get("guestCount"),
  });

  if (!parsed.success) {
    return { error: "Confira os dados do evento e tente novamente." };
  }

  const budgetLimit = parseBudgetLimitInput(formData.get("budgetLimit"));
  if (!budgetLimit.ok) return { error: budgetLimit.error };

  const searchStart = parseSearchStartInput(
    formData.get("searchStartMode"),
    formData.get("searchStartDate"),
    parsed.data.eventDate,
  );
  if (!searchStart.ok) return { error: searchStart.error };

  const municipio =
    parsed.data.cityCode === undefined ? null : findMunicipioByCode(parsed.data.cityCode);
  if (parsed.data.cityCode !== undefined && municipio === null) {
    return { error: "Escolha a cidade do evento na lista." };
  }
  if (municipio === null && parsed.data.region === undefined) {
    return { error: "Escolha a cidade do evento." };
  }
  const regionCode =
    municipio !== null ? regionForUf(municipio.uf) : (parsed.data.region ?? "outros");

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("events")
    .insert({
      owner_profile_id: user.id,
      workspace_id: workspace?.id ?? null,
      title: parsed.data.title,
      event_type: parsed.data.eventType,
      event_date: parsed.data.eventDate,
      region_code: regionCode,
      ...(municipio !== null
        ? { city: municipio.name, city_uf: municipio.uf, city_ibge_code: municipio.code }
        : {}),
      guest_count: parsed.data.guestCount,
      budget_limit_cents: budgetLimit.cents,
      search_start_date: searchStart.value,
      status: "draft",
    })
    .select("id")
    .single();

  if (error !== null || data === null) {
    logger.error({ code: error?.code }, "falha ao criar evento");
    return { error: "Não foi possível criar o evento. Tente novamente." };
  }

  try {
    await emitFeed(getSupabaseAdmin(), {
      type: "event.created",
      actorType: "user",
      actorId: user.id,
      aggregateType: "event",
      aggregateId: data.id,
      payload: { event_type: parsed.data.eventType },
      correlationId: data.id,
      source: "app",
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "feed event.created falhou",
    );
  }

  revalidatePath("/eventos");
  redirect(`/eventos/${data.id}/entrevista`);
}

export interface CouponCheckState {
  error?: string;
  ok?: boolean;
  code?: string;
  finalCents?: number;
  discountCents?: number;
  /** A oferta pessoal ativa dá mais desconto que o cupom (sem acumular). */
  offerWins?: boolean;
}

/**
 * Feedback imediato do cupom (spec: validar ANTES de gerar o Pix).
 * O checkout revalida no servidor na compra — este passo é UX + defesa em profundidade.
 */
export async function applyCouponAction(
  _previous: CouponCheckState,
  formData: FormData,
): Promise<CouponCheckState> {
  const user = await requireUser();
  const rawEntry = formData.get("code");
  const result = await previewCheckoutDiscount({
    profileId: user.id,
    category: "avulso",
    priceCents: serverEnv().B2C_TICKET_PRICE_CENTS,
    couponRaw: typeof rawEntry === "string" ? rawEntry : "",
  });
  if ("error" in result) {
    return { error: result.error };
  }
  return {
    ok: true,
    code: result.code,
    finalCents: result.finalCents,
    discountCents: result.discountCents,
    offerWins: result.offerWins,
  };
}

export interface CheckoutState {
  error?: string;
  pix?: {
    payload: string;
    invoiceUrl?: string;
    expirationDate?: string;
  };
  /** Cortesia (cupom gratuito): evento ativado sem cobrança. */
  courtesy?: { activated: true };
  /** Cartão de crédito: o pagador conclui na Fatura hospedada do Asaas. */
  card?: { invoiceUrl: string };
  applied?: {
    code: string;
    finalCents: number;
    discountCents: number;
  };
}

const buyTicketSchema = z.object({
  eventId: z.string().uuid(),
  cpf: z.string().regex(/^\d{11}$/),
  method: z.enum(["pix", "card"]).default("pix"),
});

export async function buyTicketAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await requireUser();

  const cpfEntry = formData.get("cpf");
  const rawCpf = typeof cpfEntry === "string" ? cpfEntry.replace(/\D/g, "") : "";
  const parsed = buyTicketSchema.safeParse({
    eventId: formData.get("eventId"),
    cpf: rawCpf,
    method: formData.get("method") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Informe um CPF válido (11 dígitos)." };
  }

  if (!hasAcceptedTerms(formData)) {
    return { error: TERMS_ERROR };
  }
  await recordTermsAcceptance(user.id, "checkout");

  const supabase = await createSupabaseServerClient();

  const { data: event } = await supabase
    .from("events")
    .select("id,title,status")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event === null) {
    return { error: "Evento não encontrado." };
  }

  const { data: ticket } = await supabase
    .from("event_tickets")
    .select("status")
    .eq("event_id", event.id)
    .maybeSingle();

  if (ticket?.status === "active" || event.status === "active") {
    return { error: "Este evento já está ativo — o orçamento está liberado." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,document_number,asaas_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile === null) {
    return { error: "Perfil não encontrado. Saia e entre novamente." };
  }

  let claimedOfferId: string | null = null;

  try {
    const admin = getSupabaseAdmin();
    const env = serverEnv();

    await admin
      .from("profiles")
      .update({ document_number: parsed.data.cpf, document_type: "cpf" })
      .eq("id", user.id);

    // Cupom digitado vs. oferta pessoal (0036): o MAIOR, sem acumular — tudo no servidor.
    const couponRawEntry = formData.get("coupon");
    const couponRaw = typeof couponRawEntry === "string" ? normalizeCouponCode(couponRawEntry) : "";

    let discount = 0;
    let couponCode: string | null = null;
    let reservationId: string | null = null;

    const resolved = await resolveCheckoutDiscount({
      profileId: user.id,
      category: "avulso",
      priceCents: env.B2C_TICKET_PRICE_CENTS,
      couponRaw,
      eventId: event.id,
    });

    if (resolved.kind === "error") {
      return { error: resolved.error };
    }

    if (resolved.kind === "courtesy") {
      // Cortesia: total 0, SEM Asaas. Reserva + pagamento 'COURTESY' pago +
      // tíquete ativo numa única transação no banco (0033), idempotente.
      const { data: outcome, error: rpcError } = await admin.rpc("redeem_courtesy_coupon", {
        p_code: resolved.code,
        p_profile_id: user.id,
        p_event_id: event.id,
      });
      if (rpcError !== null) {
        logger.error({ code: rpcError.code }, "falha no resgate de cortesia");
        return { error: "Não foi possível aplicar a cortesia. Tente novamente." };
      }
      if (outcome !== "activated") {
        return {
          error: COUPON_REFUSAL[String(outcome)] ?? "Cupom inválido, expirado ou esgotado.",
        };
      }
      // Cortesia não passa pelo webhook do Asaas: inicia a descoberta aqui.
      await kickoffDiscovery(event.id);
      revalidatePath(`/eventos/${event.id}`);
      return {
        courtesy: { activated: true },
        applied: { code: resolved.code, finalCents: 0, discountCents: env.B2C_TICKET_PRICE_CENTS },
      };
    }

    if (resolved.kind === "applied") {
      discount = resolved.discountCents;
      couponCode = resolved.code;
      reservationId = resolved.reservationId;
      claimedOfferId = resolved.offerId;
    } else {
      // Sem cupom e sem oferta pessoal. A boas-vindas única é a oferta pessoal da conta
      // (R$ 40 avulso / 30% pacotes, 48h — 0036); a legada de R$ 47 do visitante não vale mais.
      // Cupom sorteado: percentual SEMPRE o gravado no banco (nunca do client).
      const lucky = await reserveLuckyCoupon(user.id, event.id);
      if (lucky !== null) {
        discount = luckyDiscountCents(env.B2C_TICKET_PRICE_CENTS, lucky.percent);
        couponCode = lucky.code;
      }
    }

    const finalPrice = finalPriceCents(env.B2C_TICKET_PRICE_CENTS, discount);

    let customerId = profile.asaas_customer_id;

    if (customerId === null) {
      customerId = await createAsaasCustomer({
        name: profile.display_name,
        cpfCnpj: parsed.data.cpf,
        email: user.email,
      });
      await admin.from("profiles").update({ asaas_customer_id: customerId }).eq("id", user.id);
    }

    const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const billingType = parsed.data.method === "card" ? "CREDIT_CARD" : "PIX";
    const chargeInput = {
      customerId,
      amountCents: finalPrice,
      externalReference: event.id,
      description:
        couponCode === null
          ? `EventeIA — tíquete do evento "${event.title}"`
          : `EventeIA — tíquete do evento "${event.title}" (cupom ${couponCode})`,
      dueDate,
    };
    const pixPayment = billingType === "PIX" ? await createAsaasPixPayment(chargeInput) : null;
    const cardPayment =
      billingType === "CREDIT_CARD" ? await createAsaasCardPayment(chargeInput) : null;
    const asaasPaymentId = pixPayment?.paymentId ?? cardPayment?.paymentId ?? "";

    const { data: paymentRow, error: paymentError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        purpose: "event_ticket",
        event_id: event.id,
        asaas_payment_id: asaasPaymentId,
        billing_type: billingType,
        amount_cents: finalPrice,
        coupon_code: couponCode,
        discount_cents: discount,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError !== null || paymentRow === null) {
      logger.error({ code: paymentError?.code }, "falha ao registrar pagamento local");
      return { error: "Pagamento criado, mas o registro local falhou. Nossa equipe foi avisada." };
    }

    if (claimedOfferId !== null) {
      await attachUserOffer(claimedOfferId, paymentRow.id);
    }

    if (reservationId !== null) {
      const { error: attachError } = await admin.rpc("attach_coupon_reservation", {
        p_reservation_id: reservationId,
        p_payment_id: paymentRow.id,
      });
      if (attachError !== null) {
        logger.warn({ code: attachError.code }, "falha ao vincular reserva de cupom");
      }
    }

    const { error: ticketError } = await supabase
      .from("event_tickets")
      .upsert(
        { event_id: event.id, status: "pending", payment_id: paymentRow.id },
        { onConflict: "event_id" },
      );

    if (ticketError !== null) {
      logger.error({ code: ticketError.code }, "falha ao registrar tíquete pendente");
      return { error: "Não foi possível registrar o tíquete pendente. Tente novamente." };
    }

    await supabase.from("events").update({ status: "awaiting_payment" }).eq("id", event.id);

    try {
      await emitFeed(admin, {
        type: "payment.created",
        actorType: "user",
        actorId: user.id,
        aggregateType: "payment",
        aggregateId: paymentRow.id,
        payload: { amount_cents: finalPrice, billing_type: billingType, discount_cents: discount },
        correlationId: asaasPaymentId,
        source: "app",
      });
    } catch (caught) {
      logger.warn(
        { reason: caught instanceof Error ? caught.message : "desconhecido" },
        "feed payment.created falhou",
      );
    }

    revalidatePath(`/eventos/${event.id}`);

    return {
      ...(pixPayment !== null
        ? {
            pix: {
              payload: pixPayment.pix.payload,
              invoiceUrl: pixPayment.invoiceUrl,
              expirationDate: pixPayment.pix.expirationDate,
            },
          }
        : {}),
      ...(cardPayment !== null ? { card: { invoiceUrl: cardPayment.invoiceUrl } } : {}),
      ...(couponCode !== null
        ? {
            applied: {
              code: couponCode,
              finalCents: finalPrice,
              discountCents: discount,
            },
          }
        : {}),
    };
  } catch (caught) {
    if (claimedOfferId !== null) {
      await releaseUserOffer(claimedOfferId);
    }
    if (caught instanceof AsaasNotConfiguredError) {
      return {
        error:
          "Pagamentos ainda não configurados neste ambiente. Defina ASAAS_API_KEY para testar o Pix.",
      };
    }
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha no checkout do tíquete",
    );
    return { error: "Não foi possível gerar o pagamento. Tente novamente em instantes." };
  }
}

export interface TestimonialInviteState {
  error?: string;
  url?: string;
  expiresAt?: string;
}

const inviteEventSchema = z.object({ eventId: z.string().uuid() });

/**
 * Gera (ou reaproveita) um convite para o anfitrião contar a história do evento.
 * O link abre /depoimento?token=... e só publica após moderação.
 */
export async function createTestimonialInviteAction(
  _previous: TestimonialInviteState,
  formData: FormData,
): Promise<TestimonialInviteState> {
  const user = await requireUser();
  const parsed = inviteEventSchema.safeParse({ eventId: formData.get("eventId") });

  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,status")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event === null) {
    return { error: "Evento não encontrado." };
  }

  if (event.status !== "active" && event.status !== "completed") {
    return { error: "O convite fica disponível depois da ativação do evento." };
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("testimonial_invites")
      .select("token,expires_at")
      .eq("event_id", event.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token = existing?.token;
    let expiresAt = existing?.expires_at;

    if (token === undefined || expiresAt === undefined) {
      const { data: created, error: createError } = await admin
        .from("testimonial_invites")
        .insert({ event_id: event.id, profile_id: user.id })
        .select("token,expires_at")
        .single();

      if (createError !== null || created === null) {
        logger.error({ code: createError?.code }, "falha ao criar convite de depoimento");
        return { error: "Não foi possível criar o convite agora." };
      }

      token = created.token;
      expiresAt = created.expires_at;

      try {
        await emitFeed(admin, {
          type: "testimonial.invited",
          actorType: "user",
          actorId: user.id,
          aggregateType: "event",
          aggregateId: event.id,
          payload: { invite_expires_at: expiresAt },
          correlationId: created.token,
          source: "app",
        });
      } catch (caught) {
        logger.warn(
          { reason: caught instanceof Error ? caught.message : "desconhecido" },
          "feed testimonial.invited falhou",
        );
      }
    }

    const baseUrl = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    return { url: `${baseUrl}/depoimento?token=${token}`, expiresAt };
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao gerar convite de depoimento",
    );
    return { error: "Não foi possível gerar o convite agora." };
  }
}

export interface QuotationState {
  error?: string;
  success?: boolean;
}

const quotationSchema = z.object({
  eventId: z.string().uuid(),
  category: z.enum(["buffet", "decoracao", "musica", "fotografia", "espaco", "outro"]),
  vendorName: z.string().trim().min(2).max(80),
  vendorContact: z.string().trim().max(80).optional(),
});

export async function createQuotationAction(
  _previous: QuotationState,
  formData: FormData,
): Promise<QuotationState> {
  const user = await requireUser();

  const parsed = quotationSchema.safeParse({
    eventId: formData.get("eventId"),
    category: formData.get("category"),
    vendorName: formData.get("vendorName"),
    vendorContact: formData.get("vendorContact") ?? "",
  });

  if (!parsed.success) {
    return { error: "Confira a categoria, o fornecedor e o valor." };
  }

  const amountEntry = formData.get("amount");
  const amountText = typeof amountEntry === "string" ? amountEntry : "";

  let amountCents: number;
  try {
    amountCents = parseBRLToCents(amountText);
  } catch {
    return { error: "Informe um valor válido (ex.: 4.200,00)." };
  }

  if (amountCents <= 0) {
    return { error: "O valor da cotação deve ser maior que zero." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event === null) {
    return { error: "Evento não encontrado." };
  }

  const { data: inserted, error } = await supabase
    .from("quotations")
    .insert({
      event_id: event.id,
      category: parsed.data.category,
      vendor_name: parsed.data.vendorName,
      vendor_contact: parsed.data.vendorContact ?? null,
      amount_cents: amountCents,
      status: "draft",
      engine_version: ENGINE_VERSION,
    })
    .select("id")
    .single();

  if (error !== null || inserted === null) {
    logger.error({ code: error?.code }, "falha ao criar cotação");
    return { error: "Não foi possível salvar a cotação." };
  }

  try {
    await emitFeed(getSupabaseAdmin(), {
      type: "quotation.created",
      actorType: "user",
      actorId: user.id,
      aggregateType: "quotation",
      aggregateId: inserted.id,
      payload: { event_id: event.id, category: parsed.data.category, amount_cents: amountCents },
      correlationId: inserted.id,
      source: "app",
    });
  } catch {
    // feed não bloqueia a criação da cotação
  }

  revalidatePath(`/eventos/${event.id}`);
  return { success: true };
}

export interface ActivateEventState {
  error?: string;
  success?: boolean;
}

const activateSchema = z.object({ eventId: z.string().uuid() });

export async function activateEventWithCreditAction(
  _previous: ActivateEventState,
  formData: FormData,
): Promise<ActivateEventState> {
  const user = await requireUser();
  const parsed = activateSchema.safeParse({ eventId: formData.get("eventId") });

  if (!parsed.success) {
    return { error: "Evento inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,workspace_id,status")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event === null || event.workspace_id === null) {
    return { error: "Este evento não pertence a um workspace." };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("member_role")
    .eq("workspace_id", event.workspace_id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (membership === null || membership.member_role === "viewer") {
    return { error: "Você não tem permissão para ativar este evento." };
  }

  const admin = getSupabaseAdmin();

  const { data: ticket } = await admin
    .from("event_tickets")
    .select("status")
    .eq("event_id", event.id)
    .maybeSingle();

  if (ticket?.status === "active" || event.status === "active") {
    return { error: "Este evento já está ativo." };
  }

  const { data: ledger } = await admin
    .from("credit_ledger")
    .select("amount_cents")
    .eq("workspace_id", event.workspace_id);

  const balance = (ledger ?? []).reduce((sum, row) => sum + row.amount_cents, 0);

  if (balance < 100) {
    return { error: "Sem créditos disponíveis. Compre um pacote em Créditos." };
  }

  const { error: consumeError } = await admin.from("credit_ledger").insert({
    workspace_id: event.workspace_id,
    entry_type: "consume",
    amount_cents: -100,
    balance_after_cents: 0,
    event_id: event.id,
    idempotency_key: `consume:event:${event.id}`,
    note: "Ativação de evento",
  });

  if (consumeError !== null) {
    logger.error({ code: consumeError.code }, "falha ao consumir crédito");
    return { error: "Não foi possível consumir o crédito. Tente novamente." };
  }

  await admin
    .from("event_tickets")
    .upsert(
      { event_id: event.id, status: "active", activated_at: new Date().toISOString() },
      { onConflict: "event_id" },
    );
  await admin.from("events").update({ status: "active" }).eq("id", event.id);
  await kickoffDiscovery(event.id);

  try {
    await emitFeed(admin, {
      type: "credits.consumed",
      actorType: "user",
      actorId: user.id,
      aggregateType: "event",
      aggregateId: event.id,
      payload: { credits: 1, workspace_id: event.workspace_id },
      correlationId: event.id,
      source: "app",
    });
    await emitFeed(admin, {
      type: "event.activated",
      actorType: "user",
      actorId: user.id,
      aggregateType: "event",
      aggregateId: event.id,
      payload: { via: "credits" },
      correlationId: event.id,
      source: "app",
    });
  } catch {
    // feeds não bloqueiam a ativação
  }

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${event.id}`);
  revalidatePath("/creditos");
  redirect(`/eventos/${event.id}`);
}

export interface AddProspectState {
  error?: string;
  success?: boolean;
}

const searchStartSchema = z.object({ eventId: z.string().uuid() });

/** Cliente altera "quando começar a busca" — só enquanto a busca não começou. */
export async function updateSearchStartAction(
  _previous: ActionState & { saved?: boolean },
  formData: FormData,
): Promise<ActionState & { saved?: boolean }> {
  await requireUser();
  const parsed = searchStartSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return { error: "Evento inválido." };

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,status,event_date,discovery_started_at,quotes_delivered_at,search_start_date")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (event === null) return { error: "Evento não encontrado." };
  if (!canEditSearchStart(event) || isEventStarted(event)) return { error: "A busca já começou — a data não pode mais ser alterada." };

  const searchStart = parseSearchStartInput(formData.get("searchStartMode"), formData.get("searchStartDate"), event.event_date);
  if (!searchStart.ok) return { error: searchStart.error };

  // RLS (dono/planner) + trigger 0040 revalidam no banco.
  const { error } = await supabase.from("events").update({ search_start_date: searchStart.value }).eq("id", event.id);
  if (error !== null) {
    logger.warn({ code: error.code }, "falha ao salvar search_start_date");
    return { error: "Não foi possível salvar a data. Escolha um dia útil antes do evento." };
  }

  try {
    const { rescheduleDiscovery } = await import("@/lib/discovery/runtime");
    await rescheduleDiscovery(event.id, searchStart.value);
  } catch (rescheduleError) {
    // O worker re-checa a data na execução; reagendar é só otimização.
    logger.warn({ reason: rescheduleError instanceof Error ? rescheduleError.message : "?" }, "reagendamento da descoberta falhou");
  }

  revalidatePath(`/eventos/${event.id}`);
  return { saved: true };
}
