import "server-only";

import { resolveAsaasBaseUrl } from "@/lib/asaas/environment";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getEmailAdapter } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import { alertEmailText, budgetRemaining, hasAutomaticFallback, dailyBurn, evaluateBalance, parseAsaasBalance, parseDeepseekBalance, parseSerperBalance } from "./balances";
import { brDate, recurringDue, type RecurringRow } from "./fixed-extras";
import { currentFxMicro, currentPrices } from "./runtime";
import { renewalEmailText, renewalNotice } from "./vps-renewal";

const BURN_WINDOW_DAYS = 7;
export const DEFAULT_ALERT_EMAIL = "padecodigo@gmail.com";

type Fetched = { cents: number; currency: string; raw: number } | null;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Busca saldo ao vivo onde há API (DeepSeek, Asaas, Serper). null = sem chave/sem API. */
export async function fetchLiveBalance(provider: string, f: FetchLike = fetch): Promise<Fetched> {
  const timeout = AbortSignal.timeout(15_000);
  if (provider === "deepseek") {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return null;
    const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/v1\/?$/, "").replace(/\/$/, "");
    const res = await f(`${base}/user/balance`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: timeout });
    if (!res.ok) throw new Error(`DeepSeek HTTP ${String(res.status)}`);
    return parseDeepseekBalance(await res.json(), await currentFxMicro());
  }
  if (provider === "asaas") {
    const env = serverEnv();
    if (!env.ASAAS_API_KEY) return null;
    const base = resolveAsaasBaseUrl({ environment: env.ASAAS_ENVIRONMENT, overrideUrl: env.ASAAS_API_URL });
    const res = await f(`${base.replace(/\/$/, "")}/finance/balance`, { headers: { access_token: env.ASAAS_API_KEY }, signal: timeout });
    if (!res.ok) throw new Error(`Asaas HTTP ${String(res.status)}`);
    return parseAsaasBalance(await res.json());
  }
  if (provider === "serper") {
    const key = process.env.SERPER_API_KEY;
    if (!key) return null;
    const res = await f("https://google.serper.dev/account", { headers: { "X-API-KEY": key }, signal: timeout });
    if (!res.ok) throw new Error(`Serper HTTP ${String(res.status)}`);
    const prices = await currentPrices();
    return parseSerperBalance(await res.json(), prices["serper.per_1k"], await currentFxMicro());
  }
  return null;
}

/** Custo diário médio (7 dias) por provedor, somando cost_entries variáveis e llm_usage_events. */
async function burnByProvider(): Promise<Map<string, number>> {
  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - BURN_WINDOW_DAYS * 86_400_000).toISOString();
  const [entries, llm] = await Promise.all([
    admin.from("cost_entries").select("provider,cost_brl_cents").eq("kind", "variable").is("deleted_at", null).gte("occurred_at", since).limit(50_000),
    admin.from("llm_usage_events").select("provider,cost_brl_cents").is("deleted_at", null).gte("created_at", since).limit(50_000),
  ]);
  const sums = new Map<string, number[]>();
  for (const r of [...(entries.data ?? []), ...(llm.data ?? [])]) {
    sums.set(r.provider, [...(sums.get(r.provider) ?? []), r.cost_brl_cents ?? 0]);
  }
  return new Map([...sums].map(([p, v]) => [p, dailyBurn(v, BURN_WINDOW_DAYS)]));
}

async function monthSpend(provider: string, now: Date): Promise<number> {
  const local = new Date(now.getTime() - 3 * 3_600_000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString();
  const { data } = await getSupabaseAdmin().from("cost_entries").select("cost_brl_cents").eq("provider", provider as never).is("deleted_at", null).gte("occurred_at", start).limit(50_000);
  return (data ?? []).reduce((a, r) => a + r.cost_brl_cents, 0);
}

/** Cheque diário: atualiza saldos ao vivo, calcula fôlego e alerta (banner + e-mail Resend). */
export async function runBalanceCheck(opts: { fetchImpl?: FetchLike; now?: Date } = {}): Promise<{ checked: number; alerts: number }> {
  const admin = getSupabaseAdmin();
  const now = opts.now ?? new Date();
  const { data: rows } = await admin.from("provider_balances").select("*");
  const burn = await burnByProvider();
  const toAlert: { provider: string; label: string; balanceBrlCents: number; runwayDays: number | null; kind: "low_balance" | "low_runway" }[] = [];

  for (const row of rows ?? []) {
    const patch: Database["public"]["Tables"]["provider_balances"]["Update"] = { daily_burn_brl_cents: burn.get(row.provider) ?? row.daily_burn_brl_cents ?? null };
    let balance = row.balance_brl_cents;
    if (row.source === "budget" && row.monthly_budget_brl_cents !== null) {
      // Sem API de saldo (ex.: Google Places): saldo = orçamento mensal − gasto do mês (SP).
      const spent = await monthSpend(row.provider, now);
      balance = budgetRemaining(row.monthly_budget_brl_cents, spent);
      Object.assign(patch, { balance_brl_cents: balance, raw_currency: "BRL", raw_balance: spent / 100, fetched_at: now.toISOString(), last_error: null });
    } else if (row.source === "api") {
      try {
        const live = await fetchLiveBalance(row.provider, opts.fetchImpl);
        if (live !== null) {
          balance = live.cents;
          Object.assign(patch, { balance_brl_cents: live.cents, raw_currency: live.currency, raw_balance: live.raw, fetched_at: now.toISOString(), last_error: null });
        }
      } catch (e) {
        patch.last_error = (e instanceof Error ? e.message : "erro").slice(0, 300);
      }
    }
    const ev = evaluateBalance(
      {
        provider: row.provider,
        label: row.label,
        balanceBrlCents: balance,
        thresholdBrlCents: row.threshold_brl_cents,
        runwayAlertDays: row.runway_alert_days,
        dailyBurnBrlCents: patch.daily_burn_brl_cents ?? null,
        lastAlertAt: row.last_alert_at,
      },
      now,
    );
    // Serper com fallback automático (DeepSeek Search): saldo baixo não é emergência — sem e-mail/alerta.
    const autoFallback = hasAutomaticFallback(row.provider, Boolean(process.env.DEEPSEEK_API_KEY));
    if (ev.alert && ev.kind !== null && balance !== null && !autoFallback) {
      toAlert.push({ provider: row.provider, label: row.label, balanceBrlCents: balance, runwayDays: ev.runwayDays, kind: ev.kind });
      patch.last_alert_at = now.toISOString();
    }
    await admin.from("provider_balances").update(patch).eq("provider", row.provider);
  }

  if (toAlert.length > 0) {
    let emailed = false;
    try {
      await getEmailAdapter().send({
        to: process.env.FINANCE_ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
        subject: `EventeIA: saldo baixo em ${toAlert.map((a) => a.label).join(", ")}`,
        text: alertEmailText(toAlert),
      });
      emailed = true;
    } catch (e) {
      logger.warn({ reason: e instanceof Error ? e.message : "?" }, "falha no e-mail de alerta financeiro");
    }
    await admin.from("finance_alerts").insert(
      toAlert.map((a) => ({ provider: a.provider, kind: a.kind, balance_brl_cents: a.balanceBrlCents, runway_days: a.runwayDays, emailed })),
    );
  }
  await sendRenewalNotices(rows ?? [], now);
  await copyRecurringFixed(now);
  logger.info({ checked: rows?.length ?? 0, alerts: toAlert.length }, "cheque de saldos concluído");
  return { checked: rows?.length ?? 0, alerts: toAlert.length };
}

/** "Repete todo mês": lança a cópia do mês corrente dos custos fixos recorrentes (idempotente). */
export async function copyRecurringFixed(now: Date): Promise<number> {
  const admin = getSupabaseAdmin();
  const month = brDate(now).slice(0, 7);
  const { data } = await admin
    .from("cost_entries")
    .select("id,provider,note,occurred_at,recurring,quantity,unit_price_micro_usd,cost_micro_usd,fx_brl_per_usd_micro,cost_brl_cents,created_by")
    .eq("kind", "fixed")
    .is("deleted_at", null)
    .limit(5000);
  const rows = (data ?? []) as (RecurringRow & Record<string, unknown>)[];
  const due = recurringDue(rows.map((r) => ({ ...r, recurring: r.recurring === true })), month);
  for (const r of due) {
    const src = rows.find((x) => x.id === r.id);
    if (!src) continue;
    await admin.from("cost_entries").insert({
      occurred_at: `${month}-01T12:00:00Z`,
      provider: src.provider as never,
      kind: "fixed",
      reason: "fixed_monthly",
      quantity: src.quantity as number,
      unit_price_micro_usd: src.unit_price_micro_usd as number,
      cost_micro_usd: src.cost_micro_usd as number,
      fx_brl_per_usd_micro: src.fx_brl_per_usd_micro as number,
      cost_brl_cents: src.cost_brl_cents as number,
      is_estimate: false,
      recurring: true,
      note: src.note,
      created_by: (src.created_by as string | null) ?? null,
    });
  }
  return due.length;
}

/** Aviso de vencimento (VPS) por e-mail: mesmo limite de dias do alerta; 1 e-mail por data de vencimento. */
export async function sendRenewalNotices(
  rows: readonly { provider: string; label: string; runway_alert_days: number; renewal_date?: string | null; renewal_alerted_for?: string | null }[],
  now: Date,
): Promise<number> {
  const due = rows
    .map((r) => ({ r, n: renewalNotice(r, now) }))
    .filter((x) => x.n.send && x.n.daysLeft !== null);
  if (due.length === 0) return 0;
  try {
    await getEmailAdapter().send({
      to: process.env.FINANCE_ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
      subject: `EventeIA: vencimento de ${due.map((d) => d.r.label).join(", ")}`,
      text: renewalEmailText(due.map((d) => ({ label: d.r.label, renewalDate: d.r.renewal_date as string, daysLeft: d.n.daysLeft as number })), now),
    });
  } catch (e) {
    logger.warn({ reason: e instanceof Error ? e.message : "?" }, "falha no e-mail de vencimento");
    return 0;
  }
  const admin = getSupabaseAdmin();
  for (const d of due) await admin.from("provider_balances").update({ renewal_alerted_for: d.r.renewal_date }).eq("provider", d.r.provider);
  return due.length;
}
