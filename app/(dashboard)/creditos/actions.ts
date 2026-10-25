"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import {
  AsaasNotConfiguredError,
  createAsaasCardPayment,
  createAsaasCustomer,
  createAsaasPixPayment,
  createAsaasSubscription,
  cancelAsaasSubscription,
  discountFirstSubscriptionPayment,
  getAsaasSubscriptionFirstInvoiceUrl,
} from "@/lib/asaas/client";
import { requireUser } from "@/lib/auth";
import {
  CUSTOM_CREDITS_MAX,
  CUSTOM_CREDITS_MIN,
  customCreditsPriceCents,
} from "@/lib/credit-slider";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { previewCheckoutDiscount, resolveCheckoutDiscount } from "@/lib/offers/checkout";
import { attachUserOffer, releaseUserOffer } from "@/lib/offers/server";
import { CREDIT_PACKAGES, PLANS } from "@/lib/plans";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createWorkspaceAction(): Promise<void> {
  const user = await requireUser();
  const admin = getSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = (profile?.display_name ?? "Meu").trim().split(/\s+/)[0] ?? "Meu";

  const { data: workspace, error } = await admin
    .from("workspaces")
    .insert({ owner_id: user.id, name: `Ateliê de ${firstName}`, plan_code: "essencial" })
    .select("id")
    .single();

  if (error !== null || workspace === null) {
    logger.error({ code: error?.code }, "falha ao criar workspace");
    redirect("/creditos?erro=workspace");
  }

  await admin
    .from("workspace_members")
    .upsert(
      { workspace_id: workspace.id, profile_id: user.id, member_role: "owner" },
      { onConflict: "workspace_id,profile_id" },
    );

  revalidatePath("/creditos");
  redirect("/creditos");
}

export interface CreditsCheckoutState {
  error?: string;
  pix?: {
    payload: string;
    invoiceUrl?: string;
    expirationDate?: string;
  };
  /** Cartão de crédito: o pagador conclui na Fatura hospedada do Asaas. */
  card?: { invoiceUrl: string };
  applied?: AppliedDiscount;
}

export interface AppliedDiscount {
  code: string;
  discountCents: number;
  finalCents: number;
}

export interface PackCouponState {
  error?: string;
  ok?: boolean;
  code?: string;
  discountCents?: number;
  finalCents?: number;
  offerWins?: boolean;
}

/** Preço cheio (servidor) do item do checkout de créditos. */
function packPriceFrom(formData: FormData): number | null {
  const planCode = formData.get("planCode");
  if (typeof planCode === "string" && planCode.length > 0) {
    return PLANS.find((item) => item.code === planCode)?.priceCents ?? null;
  }
  return resolvePack(formData)?.priceCents ?? null;
}

/** "Tem um cupom?" nos pacotes/slider/franquia — prévia com a mesma regra do checkout. */
export async function applyPackCouponAction(
  _previous: PackCouponState,
  formData: FormData,
): Promise<PackCouponState> {
  const user = await requireUser();
  const price = packPriceFrom(formData);
  if (price === null) {
    return { error: "Pacote inválido." };
  }
  const raw = formData.get("code");
  const result = await previewCheckoutDiscount({
    profileId: user.id,
    category: "pack",
    priceCents: price,
    couponRaw: typeof raw === "string" ? raw : "",
  });
  if ("error" in result) {
    return { error: result.error };
  }
  return {
    ok: true,
    code: result.code,
    discountCents: result.discountCents,
    finalCents: result.finalCents,
    offerWins: result.offerWins,
  };
}

const paymentMethodSchema = z.enum(["pix", "card"]).default("pix");

export interface SubscribeState extends CreditsCheckoutState {
  success?: boolean;
  /** Assinatura recorrente: fatura hospedada do 1º ciclo (Pix ou cartão de crédito). */
  invoiceUrl?: string;
  /** Desconto aplicado SÓ na 1ª fatura (as próximas têm o valor cheio). */
  applied?: AppliedDiscount;
  /** Aviso honesto quando o desconto da 1ª fatura não pôde ser aplicado. */
  notice?: string;
}

const subscribeSchema = z.object({
  planCode: z.enum(["essencial", "atelier", "maison"]),
  renew: z.enum(["yes", "no"]),
  method: z.enum(["pix", "card"]).default("pix"),
});

/**
 * Franquia: o comprador escolhe "Renovar automaticamente todo mês?".
 * - Sim: assinatura recorrente no Asaas (Pix ou cartão de crédito); os créditos
 *   entram após cada confirmação de pagamento (webhook, migração 0009).
 * - Não: compra única dos créditos do plano (mesmo fluxo dos pacotes).
 * Créditos nunca expiram (0037).
 */
export async function subscribeToPlanAction(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const user = await requireUser();
  const parsed = subscribeSchema.safeParse({
    planCode: formData.get("planCode"),
    renew: formData.get("renew"),
    method: formData.get("method") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Escolha o plano e se deseja renovar automaticamente." };
  }

  if (parsed.data.renew === "no") {
    return buyCreditsAction({}, formData);
  }

  const plan = PLANS.find((item) => item.code === parsed.data.planCode);
  if (plan === undefined) {
    return { error: "Plano não encontrado." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (workspace === null) {
    return { error: "Crie o seu workspace antes de assinar." };
  }

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id,status")
    .eq("workspace_id", workspace.id)
    .in("status", ["pending", "active"])
    .limit(1)
    .maybeSingle();

  if (existingSub !== null) {
    return { error: "Este workspace já possui uma assinatura ativa." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,document_number,asaas_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile === null) {
    return { error: "Perfil não encontrado." };
  }

  if (profile.document_number === null || profile.document_number.length < 11) {
    return { error: "Cadastre o CPF no Perfil antes de assinar." };
  }

  let claimedOfferId: string | null = null;
  try {
    const admin = getSupabaseAdmin();

    const couponEntry = formData.get("coupon");
    const resolved = await resolveCheckoutDiscount({
      profileId: user.id,
      category: "pack",
      priceCents: plan.priceCents,
      couponRaw: typeof couponEntry === "string" ? couponEntry : "",
      eventId: null,
    });
    if (resolved.kind === "error") {
      return { error: resolved.error };
    }
    const applied = resolved.kind === "applied" ? resolved : null;
    claimedOfferId = applied?.offerId ?? null;

    let customerId = profile.asaas_customer_id;
    if (customerId === null) {
      customerId = await createAsaasCustomer({
        name: profile.display_name,
        cpfCnpj: profile.document_number,
        email: user.email,
      });
      await admin.from("profiles").update({ asaas_customer_id: customerId }).eq("id", user.id);
    }

    const nextDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const subscription = await createAsaasSubscription({
      customerId,
      priceCents: plan.priceCents,
      description: `EventeIA — ${plan.name} (${String(plan.credits)} créditos/mês)`,
      nextDueDate,
      billingType: parsed.data.method === "card" ? "CREDIT_CARD" : "PIX",
    });

    const { error: insertError } = await admin.from("subscriptions").insert({
      workspace_id: workspace.id,
      plan_code: plan.code,
      asaas_subscription_id: subscription.subscriptionId,
      status: "pending",
    });

    if (insertError !== null) {
      logger.error({ code: insertError.code }, "falha ao registrar assinatura local");
      return { error: "Assinatura criada no Asaas, mas o registro local falhou." };
    }

    // Desconto (oferta/cupom) somente na 1ª fatura da franquia.
    let firstInvoice: AppliedDiscount | undefined;
    let notice: string | undefined;
    if (applied !== null && applied.discountCents > 0) {
      const finalCents = plan.priceCents - applied.discountCents;
      try {
        const { paymentId } = await discountFirstSubscriptionPayment({
          subscriptionId: subscription.subscriptionId,
          amountCents: finalCents,
        });
        const local = {
          amount_cents: finalCents,
          coupon_code: applied.code,
          discount_cents: applied.discountCents,
        };
        // O webhook PAYMENT_CREATED pode ter chegado antes: atualiza só valores, nunca o status.
        const { data: inserted } = await admin
          .from("payments")
          .insert({
            profile_id: user.id,
            purpose: "subscription_invoice",
            workspace_id: workspace.id,
            asaas_payment_id: paymentId,
            billing_type: parsed.data.method === "card" ? "CREDIT_CARD" : "PIX",
            status: "pending",
            ...local,
          })
          .select("id")
          .maybeSingle();
        let localId = inserted?.id ?? null;
        if (localId === null) {
          const { data: updated } = await admin
            .from("payments")
            .update(local)
            .eq("asaas_payment_id", paymentId)
            .select("id")
            .maybeSingle();
          localId = updated?.id ?? null;
        }
        if (localId !== null) {
          if (applied.offerId !== null) await attachUserOffer(applied.offerId, localId);
          if (applied.reservationId !== null) {
            await admin.rpc("attach_coupon_reservation", {
              p_reservation_id: applied.reservationId,
              p_payment_id: localId,
            });
          }
        }
        firstInvoice = { code: applied.code, discountCents: applied.discountCents, finalCents };
      } catch (caught) {
        logger.warn(
          { reason: caught instanceof Error ? caught.message : "desconhecido" },
          "desconto da 1ª fatura não aplicado",
        );
        if (applied.offerId !== null) await releaseUserOffer(applied.offerId);
        notice =
          "Não conseguimos aplicar o desconto na 1ª fatura — ela veio com o valor cheio e sua oferta/cupom continua disponível.";
      }
    }
    claimedOfferId = null;

    try {
      await emitFeed(admin, {
        type: "subscription.created",
        actorType: "user",
        actorId: user.id,
        aggregateType: "workspace",
        aggregateId: workspace.id,
        payload: { plan_code: plan.code, price_cents: plan.priceCents },
        correlationId: subscription.subscriptionId,
        source: "app",
      });
    } catch {
      // feed não bloqueia a assinatura
    }

    let invoiceUrl: string | null = null;
    try {
      invoiceUrl = await getAsaasSubscriptionFirstInvoiceUrl(subscription.subscriptionId);
    } catch {
      // a fatura também chega por e-mail do Asaas
    }

    revalidatePath("/creditos");
    return {
      success: true,
      ...(invoiceUrl !== null ? { invoiceUrl } : {}),
      ...(firstInvoice !== undefined ? { applied: firstInvoice } : {}),
      ...(notice !== undefined ? { notice } : {}),
    };
  } catch (caught) {
    if (claimedOfferId !== null) {
      await releaseUserOffer(claimedOfferId);
    }
    if (caught instanceof AsaasNotConfiguredError) {
      return { error: "Pagamentos não configurados neste ambiente (ASAAS_API_KEY)." };
    }
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao criar assinatura",
    );
    return { error: "Não foi possível criar a assinatura. Tente novamente." };
  }
}

const buyCreditsSchema = z.object({
  packageCode: z.enum(["pacote-3", "pacote-7", "pacote-17"]),
});

const customCreditsSchema = z.object({
  credits: z.coerce.number().int().min(CUSTOM_CREDITS_MIN).max(CUSTOM_CREDITS_MAX),
});

interface ResolvedPack {
  code: string;
  name: string;
  credits: number;
  priceCents: number;
}

/**
 * Resolve o pacote no servidor. Aceita o pacote fixo legado (`packageCode`) ou a
 * quantidade do slider (`credits`, 3..20). O preço é SEMPRE recalculado aqui;
 * qualquer preço vindo do cliente é ignorado.
 */
function resolvePack(formData: FormData): ResolvedPack | null {
  const rawPlan = formData.get("planCode");
  if (rawPlan !== null) {
    // Franquia sem renovação: compra única dos créditos do plano.
    const plan = PLANS.find((item) => item.code === rawPlan);
    if (plan === undefined) return null;
    return {
      code: `plano-${plan.code}-unico`,
      name: `${plan.name} (compra única)`,
      credits: plan.credits,
      priceCents: plan.priceCents,
    };
  }
  const rawCredits = formData.get("credits");
  if (rawCredits !== null) {
    const parsed = customCreditsSchema.safeParse({ credits: rawCredits });
    if (!parsed.success) return null;
    const credits = parsed.data.credits;
    return {
      code: `custom-${String(credits)}`,
      name: `Pacote ${String(credits)}`,
      credits,
      priceCents: customCreditsPriceCents(credits),
    };
  }
  const parsed = buyCreditsSchema.safeParse({ packageCode: formData.get("packageCode") });
  if (!parsed.success) return null;
  return CREDIT_PACKAGES.find((item) => item.code === parsed.data.packageCode) ?? null;
}

export async function buyCreditsAction(
  _previous: CreditsCheckoutState,
  formData: FormData,
): Promise<CreditsCheckoutState> {
  const user = await requireUser();
  const pack = resolvePack(formData);

  if (pack === null) {
    return { error: "Pacote inválido." };
  }

  const method = paymentMethodSchema.safeParse(formData.get("method") ?? undefined);
  if (!method.success) {
    return { error: "Forma de pagamento inválida." };
  }
  const billingType = method.data === "card" ? "CREDIT_CARD" : "PIX";

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (workspace === null) {
    return { error: "Crie o seu workspace antes de comprar créditos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,document_number,asaas_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile === null) {
    return { error: "Perfil não encontrado." };
  }

  if (profile.document_number === null || profile.document_number.length < 11) {
    return { error: "Cadastre o CPF no Perfil antes de comprar créditos." };
  }

  let claimedOfferId: string | null = null;
  try {
    const admin = getSupabaseAdmin();

    // Cupom digitado vs. oferta pessoal: o MAIOR, sem acumular (servidor).
    const couponEntry = formData.get("coupon");
    const resolved = await resolveCheckoutDiscount({
      profileId: user.id,
      category: "pack",
      priceCents: pack.priceCents,
      couponRaw: typeof couponEntry === "string" ? couponEntry : "",
      eventId: null,
    });
    if (resolved.kind === "error") {
      return { error: resolved.error };
    }
    const applied = resolved.kind === "applied" ? resolved : null;
    claimedOfferId = applied?.offerId ?? null;
    const discount = applied?.discountCents ?? 0;
    const finalCents = pack.priceCents - discount;

    let customerId = profile.asaas_customer_id;

    if (customerId === null) {
      customerId = await createAsaasCustomer({
        name: profile.display_name,
        cpfCnpj: profile.document_number,
        email: user.email,
      });
      await admin.from("profiles").update({ asaas_customer_id: customerId }).eq("id", user.id);
    }

    const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const chargeInput = {
      customerId,
      amountCents: finalCents,
      externalReference: `topup:${workspace.id}:${pack.code}`,
      description:
        applied === null
          ? `EventeIA — ${pack.name} (${String(pack.credits)} créditos)`
          : `EventeIA — ${pack.name} (${String(pack.credits)} créditos, cupom ${applied.code})`,
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
        purpose: "credit_topup",
        event_id: null,
        workspace_id: workspace.id,
        credits_granted: pack.credits,
        asaas_payment_id: asaasPaymentId,
        billing_type: billingType,
        amount_cents: finalCents,
        coupon_code: applied?.code ?? null,
        discount_cents: discount,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError !== null || paymentRow === null) {
      logger.error({ code: paymentError?.code }, "falha ao registrar top-up");
      return { error: "Pagamento criado, mas o registro local falhou." };
    }
    claimedOfferId = null;
    if (applied !== null && applied.offerId !== null) {
      await attachUserOffer(applied.offerId, paymentRow.id);
    }
    if (applied !== null && applied.reservationId !== null) {
      await admin.rpc("attach_coupon_reservation", {
        p_reservation_id: applied.reservationId,
        p_payment_id: paymentRow.id,
      });
    }
    const appliedState =
      applied === null
        ? {}
        : { applied: { code: applied.code, discountCents: discount, finalCents } };

    try {
      await emitFeed(admin, {
        type: "payment.created",
        actorType: "user",
        actorId: user.id,
        aggregateType: "payment",
        aggregateId: asaasPaymentId,
        payload: {
          amount_cents: finalCents,
          credits_granted: pack.credits,
          billing_type: billingType,
          purpose: "credit_topup",
        },
        correlationId: asaasPaymentId,
        source: "app",
      });
    } catch {
      // feed não bloqueia o checkout
    }

    if (cardPayment !== null) {
      return { card: { invoiceUrl: cardPayment.invoiceUrl }, ...appliedState };
    }
    return {
      ...appliedState,
      pix: {
        payload: pixPayment?.pix.payload ?? "",
        invoiceUrl: pixPayment?.invoiceUrl,
        expirationDate: pixPayment?.pix.expirationDate,
      },
    };
  } catch (caught) {
    if (claimedOfferId !== null) {
      await releaseUserOffer(claimedOfferId);
    }
    if (caught instanceof AsaasNotConfiguredError) {
      return { error: "Pagamentos não configurados neste ambiente (ASAAS_API_KEY)." };
    }
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao comprar créditos",
    );
    return { error: "Não foi possível gerar o pagamento. Tente novamente." };
  }
}

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
}

/** Cancela a renovação automática. Créditos já concedidos permanecem (não expiram). */
export async function cancelSubscriptionAction(
  _previous: CancelSubscriptionState,
  _formData: FormData,
): Promise<CancelSubscriptionState> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (workspace === null) {
    return { error: "Workspace não encontrado." };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id,asaas_subscription_id")
    .eq("workspace_id", workspace.id)
    .in("status", ["pending", "active", "overdue"])
    .limit(1)
    .maybeSingle();

  if (sub === null) {
    return { error: "Nenhuma renovação automática ativa." };
  }

  try {
    await cancelAsaasSubscription(sub.asaas_subscription_id);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("id", sub.id)
      .eq("workspace_id", workspace.id);
    if (error !== null) {
      logger.error({ code: error.code }, "falha ao marcar assinatura cancelada");
      return { error: "Recorrência cancelada no Asaas, mas o registro local falhou." };
    }
    try {
      await emitFeed(admin, {
        type: "subscription.canceled",
        actorType: "user",
        actorId: user.id,
        aggregateType: "workspace",
        aggregateId: workspace.id,
        payload: {},
        correlationId: sub.asaas_subscription_id,
        source: "app",
      });
    } catch {
      // feed não bloqueia
    }
    revalidatePath("/creditos");
    return { success: true };
  } catch (caught) {
    if (caught instanceof AsaasNotConfiguredError) {
      return { error: "Pagamentos não configurados neste ambiente (ASAAS_API_KEY)." };
    }
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao cancelar assinatura",
    );
    return { error: "Não foi possível cancelar a renovação. Tente novamente." };
  }
}
