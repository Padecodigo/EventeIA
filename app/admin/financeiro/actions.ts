"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { clearCostPeriod, softDeleteCostRows, type CostDb } from "@/lib/finance/cost-delete";
import { microUsdToBrlCents, parseFxToMicro, PRICE_KEYS } from "@/lib/finance/pricing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FIXED_COST_PROVIDERS = ["vps", "supabase", "domain", "resend", "serper", "google_places", "deepseek", "other"] as const;

export interface FinanceActionState {
  error?: string;
  success?: string;
}

const usdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(?:[.,]\d{1,6})?$/, "Valor em US$ inválido")
  .transform((v) => {
    const [i = "0", f = ""] = v.replace(",", ".").split(".");
    return Number(i) * 1_000_000 + Number(f.padEnd(6, "0"));
  });

const fixedSchema = z.object({
  provider: z.enum(FIXED_COST_PROVIDERS),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  usd: usdSchema,
  fx: z.string().transform((v, ctx) => {
    const m = parseFxToMicro(v);
    if (m === null) ctx.addIssue({ code: "custom", message: "Câmbio inválido" });
    return m ?? 0;
  }),
  note: z.string().trim().max(300).optional(),
});

/** Custo fixo mensal (VPS, Supabase, domínio...) lançado manualmente pelo admin. */
export async function addFixedCostAction(_prev: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const user = await requireAdmin();
  const parsed = fixedSchema.safeParse({
    provider: form.get("provider"),
    month: form.get("month"),
    usd: form.get("usd"),
    fx: form.get("fx"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("cost_entries").insert({
    occurred_at: `${d.month}-01T12:00:00Z`,
    provider: d.provider,
    kind: "fixed",
    reason: "fixed_monthly",
    quantity: 1,
    unit_price_micro_usd: d.usd,
    cost_micro_usd: d.usd,
    fx_brl_per_usd_micro: d.fx,
    cost_brl_cents: microUsdToBrlCents(d.usd, d.fx),
    note: d.note ?? null,
    created_by: user.id,
  });
  if (error !== null) return { error: "Não foi possível lançar o custo." };
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/custos");
  return { success: "Custo fixo lançado." };
}

const fxSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fx: z.string() });

export async function setFxAction(_prev: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  await requireAdmin();
  const parsed = fxSchema.safeParse({ date: form.get("date"), fx: form.get("fx") });
  const micro = parsed.success ? parseFxToMicro(parsed.data.fx) : null;
  if (!parsed.success || micro === null) return { error: "Câmbio inválido (ex.: 5,60)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("fx_rates")
    .upsert({ rate_date: parsed.data.date, brl_per_usd_micro: micro, source: "manual" }, { onConflict: "rate_date" });
  if (error !== null) return { error: "Não foi possível salvar o câmbio." };
  revalidatePath("/admin/financeiro");
  return { success: "Câmbio salvo." };
}

const priceSchema = z.object({ key: z.enum(PRICE_KEYS), usd: usdSchema });

/** Sobrepõe um preço (US$ por 1M tokens ou por 1000 requisições). */
export async function setPriceAction(_prev: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const user = await requireAdmin();
  const parsed = priceSchema.safeParse({ key: form.get("key"), usd: form.get("usd") });
  if (!parsed.success) return { error: "Preço inválido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("pricing_rates").upsert(
    {
      key: parsed.data.key,
      micro_usd: parsed.data.usd,
      unit: parsed.data.key.endsWith("per_1k") ? "per_1k_requests" : "per_1m_tokens",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error !== null) return { error: "Não foi possível salvar o preço." };
  revalidatePath("/admin/financeiro");
  return { success: "Preço atualizado (vale para as próximas chamadas)." };
}

/** "Excluir" linhas do Detalhamento (soft delete). Só admin; grava pelo servidor após requireAdmin. */
export async function deleteCostRowsAction(_prev: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const user = await requireAdmin();
  const r = await softDeleteCostRows(getSupabaseAdmin() as unknown as CostDb, form.getAll("ref"), user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/custos");
  revalidatePath("/admin/consumo");
  return { success: "Excluído (dá para recuperar)." };
}

/** "Limpar" os custos de um período (e provedor, se escolhido). Nunca toca em pagamentos. */
export async function clearCostPeriodAction(_prev: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const user = await requireAdmin();
  const provider = form.get("provider");
  const r = await clearCostPeriod(
    getSupabaseAdmin() as unknown as CostDb,
    { from: form.get("from"), to: form.get("to"), ...(typeof provider === "string" && provider !== "" ? { provider } : {}) },
    user.id,
  );
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/custos");
  revalidatePath("/admin/consumo");
  return { success: "Custos do período excluídos (dá para recuperar)." };
}
