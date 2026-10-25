"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { runBalanceCheck } from "@/lib/finance/balance-monitor";
import { brlCentsToMicroUsd, parseBrlToCents } from "@/lib/finance/brl";
import { currentFxMicro } from "@/lib/finance/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CostsActionState {
  error?: string;
  success?: string;
}

const balanceSchema = z.object({
  provider: z.string().regex(/^[a-z0-9_]{2,40}$/),
  balance: z.string().trim().max(20),
  budget: z.string().trim().max(20),
  threshold: z.string().trim().min(1).max(20),
  runwayDays: z.coerce.number().int().min(1).max(90),
  note: z.string().trim().max(300).optional(),
  renewal: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  monthlyCost: z.string().trim().max(20).optional(),
});

/** Saldo manual (provedores sem API) + limiar de alerta e dias mínimos de fôlego. */
export async function updateBalanceAction(_prev: CostsActionState, form: FormData): Promise<CostsActionState> {
  const user = await requireAdmin();
  const parsed = balanceSchema.safeParse({
    provider: form.get("provider"),
    balance: form.get("balance") ?? "",
    budget: form.get("budget") ?? "",
    threshold: form.get("threshold"),
    runwayDays: form.get("runwayDays"),
    note: form.get("note") || undefined,
    renewal: form.get("renewal") ?? undefined,
    monthlyCost: form.get("monthlyCost") ?? undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };
  const d = parsed.data;
  const monthlyCost = d.monthlyCost === undefined || d.monthlyCost === "" ? undefined : parseBrlToCents(d.monthlyCost);
  if (monthlyCost === null) return { error: "Valor mensal em R$ inválido (ex.: 100,00)." };
  const threshold = parseBrlToCents(d.threshold);
  const balance = d.balance === "" ? undefined : parseBrlToCents(d.balance);
  const budget = d.budget === "" ? undefined : parseBrlToCents(d.budget);
  if (threshold === null || balance === null || budget === null) return { error: "Valor em R$ inválido (ex.: 150,00)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("provider_balances")
    .update({
      threshold_brl_cents: threshold,
      runway_alert_days: d.runwayDays,
      note: d.note ?? null,
      ...(budget !== undefined ? { monthly_budget_brl_cents: budget } : {}),
      ...(d.renewal !== undefined ? { renewal_date: d.renewal === "" ? null : d.renewal } : {}),
      ...(monthlyCost !== undefined ? { monthly_cost_brl_cents: monthlyCost } : {}),
      ...(balance !== undefined ? { balance_brl_cents: balance, fetched_at: new Date().toISOString() } : {}),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", d.provider);
  if (error !== null) return { error: "Não foi possível salvar." };
  revalidatePath("/admin/custos");
  return { success: "Salvo." };
}

/** Roda o cheque de saldos agora (o agendado roda diariamente às 08:00). */
export async function checkBalancesNowAction(_prev: CostsActionState): Promise<CostsActionState> {
  await requireAdmin();
  try {
    const r = await runBalanceCheck();
    revalidatePath("/admin/custos");
    revalidatePath("/admin", "layout");
    return { success: `Verificados ${String(r.checked)} provedores; ${String(r.alerts)} alerta(s).` };
  } catch {
    return { error: "Falha ao verificar saldos." };
  }
}

const fixedEditSchema = z.object({
  id: z.string().uuid(),
  amount: z.string().trim().min(1).max(20),
  note: z.string().trim().max(300).optional(),
});

/** Corrige um custo fixo (valor em R$). RLS: só admin e só kind = 'fixed'. */
export async function updateFixedCostAction(_prev: CostsActionState, form: FormData): Promise<CostsActionState> {
  await requireAdmin();
  const parsed = fixedEditSchema.safeParse({ id: form.get("id"), amount: form.get("amount"), note: form.get("note") || undefined });
  const cents = parsed.success ? parseBrlToCents(parsed.data.amount) : null;
  if (!parsed.success || cents === null) return { error: "Valor em R$ inválido." };
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase.from("cost_entries").select("fx_brl_per_usd_micro,kind").eq("id", parsed.data.id).maybeSingle();
  if (row === null || row.kind !== "fixed") return { error: "Custo fixo não encontrado." };
  const costMicroUsd = brlCentsToMicroUsd(cents, row.fx_brl_per_usd_micro);
  const { error } = await supabase
    .from("cost_entries")
    .update({ cost_brl_cents: cents, cost_micro_usd: costMicroUsd, unit_price_micro_usd: costMicroUsd, note: parsed.data.note ?? null })
    .eq("id", parsed.data.id)
    .eq("kind", "fixed");
  if (error !== null) return { error: "Não foi possível salvar." };
  revalidatePath("/admin/custos");
  revalidatePath("/admin/financeiro");
  return { success: "Custo atualizado." };
}

const deleteSchema = z.object({
  target: z.enum(["fixed", "alert"]),
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * Exclusão RECUPERÁVEL (soft delete: deleted_at) de custos fixos e alertas. Só admin (requireAdmin + RLS).
 * Recebe exatamente os IDs mostrados no modal de confirmação ("Excluir" = 1; "Limpar histórico" = todos da seção).
 * Nunca toca em custos variáveis, eventos, pagamentos ou dados de clientes.
 */
export async function softDeleteAction(_prev: CostsActionState, form: FormData): Promise<CostsActionState> {
  const user = await requireAdmin();
  const parsed = deleteSchema.safeParse({ target: form.get("target"), ids: form.getAll("id") });
  if (!parsed.success) return { error: "Pedido inválido." };
  const { target, ids } = parsed.data;
  const marks = { deleted_at: new Date().toISOString(), deleted_by: user.id };
  const supabase = await createSupabaseServerClient();
  const { error } =
    target === "fixed"
      ? await supabase.from("cost_entries").update(marks).in("id", ids).eq("kind", "fixed").is("deleted_at", null)
      : await supabase.from("finance_alerts").update(marks).in("id", ids).is("deleted_at", null);
  if (error !== null) return { error: "Não foi possível excluir." };
  revalidatePath("/admin/custos");
  revalidatePath("/admin/financeiro");
  return { success: ids.length === 1 ? "Item excluído (pode ser recuperado)." : `${String(ids.length)} itens excluídos (podem ser recuperados).` };
}

const FIXED_ADD_PROVIDERS = ["vps", "supabase", "domain", "other"] as const;

const addFixedSchema = z
  .object({
    provider: z.enum(FIXED_ADD_PROVIDERS),
    name: z.string().trim().max(60).optional(),
    amount: z.string().trim().min(1).max(20),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    recurring: z.boolean(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.provider !== "other" || (d.name ?? "").length >= 2, { message: "Informe o nome do custo." });

/** "Adicionar custo fixo" direto na Saúde financeira (valor em R$). Só admin (requireAdmin + RLS de insert). */
export async function addFixedCostBrlAction(_prev: CostsActionState, form: FormData): Promise<CostsActionState> {
  const user = await requireAdmin();
  const parsed = addFixedSchema.safeParse({
    provider: form.get("provider"),
    name: form.get("name") || undefined,
    amount: form.get("amount"),
    month: form.get("month"),
    recurring: form.get("recurring") === "on",
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message === "Informe o nome do custo." ? "Informe o nome do custo." : "Dados inválidos." };
  const d = parsed.data;
  const cents = parseBrlToCents(d.amount);
  if (cents === null || cents <= 0) return { error: "Valor em R$ inválido (ex.: 100,00)." };
  const fx = await currentFxMicro();
  const micro = brlCentsToMicroUsd(cents, fx);
  const note = [d.provider === "other" ? d.name : undefined, d.note].filter(Boolean).join(" · ") || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("cost_entries").insert({
    occurred_at: `${d.month}-01T12:00:00Z`,
    provider: d.provider,
    kind: "fixed",
    reason: "fixed_monthly",
    quantity: 1,
    unit_price_micro_usd: micro,
    cost_micro_usd: micro,
    fx_brl_per_usd_micro: fx,
    cost_brl_cents: cents,
    is_estimate: false,
    recurring: d.recurring,
    note,
    created_by: user.id,
  });
  if (error !== null) return { error: "Não foi possível adicionar o custo." };
  revalidatePath("/admin/custos");
  revalidatePath("/admin/financeiro");
  return { success: d.recurring ? "Custo fixo adicionado (repete todo mês)." : "Custo fixo adicionado." };
}
