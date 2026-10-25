import "server-only";

import { resolveAsaasBaseUrl } from "@/lib/asaas/environment";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getEmailAdapter } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import { alertEmailText, budgetRemaining, dailyBurn, evaluateBalance, parseAsaasBalance, parseDeepseekBalance, parseSerperBalance } from "./balances";
import { currentFxMicro, currentPrices } from "./runtime";

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
    admin.from("llm_usage_events").select("provider,cost_brl_cents").gte("created_at", since).limit(50_000),
  ]);
  const sums = new Map<string, number[]>();
  for (const r of [...(entries.data ?? []), ...(llm.data ?? [])]) {
    const p = r.provider === "whatsapp" ? "whatsapp" : r.provider;
    sums.set(p, [...(sums.get(p) ?? []), r.cost_brl_cents ?? 0]);
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
    if (ev.alert && ev.kind !== null && balance !== null) {
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
  logger.info({ checked: rows?.length ?? 0, alerts: toAlert.length }, "cheque de saldos concluído");
  return { checked: rows?.length ?? 0, alerts: toAlert.length };
}
