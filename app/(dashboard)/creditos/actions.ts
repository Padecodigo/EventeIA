"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import {
  AsaasNotConfiguredError,
  createAsaasCustomer,
  createAsaasPixPayment,
  createAsaasSubscription,
} from "@/lib/asaas/client";
import { requireUser } from "@/lib/auth";
import {
  CUSTOM_CREDITS_MAX,
  CUSTOM_CREDITS_MIN,
  customCreditsPriceCents,
} from "@/lib/credit-slider";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
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
}

export interface SubscribeState {
  error?: string;
  success?: boolean;
}

const subscribeSchema = z.object({
  planCode: z.enum(["essencial", "atelier", "maison"]),
});

/**
 * Cria a assinatura recorrente no Asaas (uma fatura Pix por mês). A franquia
 * de créditos é concedida automaticamente quando o webhook confirma a fatura
 * (migração 0009). Ver .context/PAYMENTS.md §7.
 */
export async function subscribeToPlanAction(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const user = await requireUser();
  const parsed = subscribeSchema.safeParse({ planCode: formData.get("planCode") });

  if (!parsed.success) {
    return { error: "Plano inválido." };
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

  try {
    const admin = getSupabaseAdmin();

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

    revalidatePath("/creditos");
    return { success: true };
  } catch (caught) {
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

  try {
    const admin = getSupabaseAdmin();
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

    const asaasPayment = await createAsaasPixPayment({
      customerId,
      amountCents: pack.priceCents,
      externalReference: `topup:${workspace.id}:${pack.code}`,
      description: `EventeIA — ${pack.name} (${String(pack.credits)} créditos)`,
      dueDate,
    });

    const { error: paymentError } = await supabase.from("payments").insert({
      profile_id: user.id,
      purpose: "credit_topup",
      event_id: null,
      workspace_id: workspace.id,
      credits_granted: pack.credits,
      asaas_payment_id: asaasPayment.paymentId,
      billing_type: "PIX",
      amount_cents: pack.priceCents,
      status: "pending",
    });

    if (paymentError !== null) {
      logger.error({ code: paymentError.code }, "falha ao registrar top-up");
      return { error: "Pagamento criado, mas o registro local falhou." };
    }

    try {
      await emitFeed(admin, {
        type: "payment.created",
        actorType: "user",
        actorId: user.id,
        aggregateType: "payment",
        aggregateId: asaasPayment.paymentId,
        payload: {
          amount_cents: pack.priceCents,
          credits_granted: pack.credits,
          billing_type: "PIX",
          purpose: "credit_topup",
        },
        correlationId: asaasPayment.paymentId,
        source: "app",
      });
    } catch {
      // feed não bloqueia o checkout
    }

    return {
      pix: {
        payload: asaasPayment.pix.payload,
        invoiceUrl: asaasPayment.invoiceUrl,
        expirationDate: asaasPayment.pix.expirationDate,
      },
    };
  } catch (caught) {
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
