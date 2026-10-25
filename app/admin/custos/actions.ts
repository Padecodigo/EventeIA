"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { runBalanceCheck } from "@/lib/finance/balance-monitor";
import { brlCentsToMicroUsd, parseBrlToCents } from "@/lib/finance/brl";
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
  });
  if (!parsed.success) return { error: "Dados inválidos." };
  const d = parsed.data;
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
