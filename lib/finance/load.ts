import "server-only";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { EventStatRow } from "./analytics";
import { DEFAULT_FX_BRL_PER_USD_MICRO, microUsdToBrlCents } from "./pricing";
import type { CostRow, RevenueRow } from "./report";

const MAX_ROWS = 20_000;
const PLAN_LABELS: Record<string, string> = {
  event_ticket: "Tíquete avulso",
  credit_topup: "Créditos (B2B)",
  subscription_invoice: "Assinatura",
};
export const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  grok: "xAI (Grok)",
  xai: "xAI (Grok)",
  nim: "NVIDIA NIM",
  search: "Search API",
  fetch: "Fetch API",
  whatsapp: "WhatsApp",
  asaas: "Asaas",
  vps: "VPS",
  supabase: "Supabase",
  domain: "Domínio",
  other: "Outros",
};

export interface FinanceData {
  costs: CostRow[];
  revenue: RevenueRow[];
  eventTitles: Record<string, string>;
  truncated: boolean;
}

/** Somente admin: checagem no servidor (requireAdmin) + RLS is_admin() nas tabelas. */
export async function loadFinance(period: { from: string; to: string }): Promise<FinanceData> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const start = `${period.from}T00:00:00Z`;
  const end = `${period.to}T23:59:59.999Z`;

  const [llm, entries, pays] = await Promise.all([
    supabase
      .from("llm_usage_events")
      .select("created_at,provider,task,reason,event_id,input_tokens,output_tokens,cache_hit_tokens,cost_micro_usd,cost_brl_cents,fx_brl_per_usd_micro,peak,outcome")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    supabase
      .from("cost_entries")
      .select("occurred_at,provider,kind,reason,event_id,quantity,cost_micro_usd,cost_brl_cents,note")
      .gte("occurred_at", start)
      .lte("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(MAX_ROWS),
    supabase
      .from("payments")
      .select("id,profile_id,purpose,event_id,amount_cents,asaas_fee_cents,net_cents,status,created_at,confirmed_at,refunded_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
  ]);

  const costs: CostRow[] = [
    ...(llm.data ?? []).map((r) => ({
      at: r.created_at,
      provider: r.provider === "grok" ? "xai" : r.provider,
      reason: r.reason ?? r.task,
      kind: "variable" as const,
      eventId: r.event_id,
      costMicroUsd: r.cost_micro_usd,
      costBrlCents: r.cost_brl_cents ?? microUsdToBrlCents(r.cost_micro_usd, r.fx_brl_per_usd_micro ?? DEFAULT_FX_BRL_PER_USD_MICRO),
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      detail: `${r.task} · ${r.outcome}${r.peak === true ? " · pico" : r.peak === false ? " · fora de pico" : ""}${r.cache_hit_tokens > 0 ? ` · cache ${String(r.cache_hit_tokens)}` : ""}`,
    })),
    ...(entries.data ?? []).map((r) => ({
      at: r.occurred_at,
      provider: r.provider,
      reason: r.reason,
      kind: r.kind,
      eventId: r.event_id,
      costMicroUsd: r.cost_micro_usd,
      costBrlCents: r.cost_brl_cents,
      inputTokens: 0,
      outputTokens: 0,
      detail: `${String(r.quantity)}×${r.note ? ` · ${r.note}` : ""}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const payRows = pays.data ?? [];
  const profileIds = [...new Set(payRows.map((p) => p.profile_id))];
  const eventIds = [...new Set(costs.map((c) => c.eventId).filter((e): e is string => e !== null))].slice(0, 500);
  const admin = getSupabaseAdmin();
  const [profiles, events] = await Promise.all([
    profileIds.length > 0 ? supabase.from("profiles").select("id,display_name").in("id", profileIds.slice(0, 500)) : Promise.resolve({ data: [] }),
    eventIds.length > 0 ? admin.from("events").select("id,title").in("id", eventIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));

  const revenue: RevenueRow[] = payRows.map((p) => ({
    at: p.confirmed_at ?? p.created_at,
    paymentId: p.id,
    clientId: p.profile_id,
    clientLabel: (names.get(p.profile_id) ?? "") || `cliente ${p.profile_id.slice(0, 8)}`,
    plan: PLAN_LABELS[p.purpose] ?? p.purpose,
    eventId: p.event_id,
    grossCents: p.amount_cents,
    feeCents: p.asaas_fee_cents ?? 0,
    netCents: p.net_cents ?? p.amount_cents - (p.asaas_fee_cents ?? 0),
    status: p.status,
    refunded: p.status === "refunded" || p.status === "chargeback" || p.refunded_at !== null,
  }));

  return {
    costs,
    revenue,
    eventTitles: Object.fromEntries((events.data ?? []).map((e) => [e.id, e.title])),
    truncated: [llm.data, entries.data, pays.data].some((d) => (d?.length ?? 0) >= MAX_ROWS),
  };
}

export interface EventStats {
  events: EventStatRow[];
  paidEventIds: Set<string>;
}

/** Eventos criados no período (funil e distribuição por tipo/cidade). Somente admin. */
export async function loadEventStats(period: { from: string; to: string }): Promise<EventStats> {
  await requireAdmin();
  const admin = getSupabaseAdmin();
  const start = `${period.from}T00:00:00Z`;
  const end = `${period.to}T23:59:59.999Z`;
  const { data } = await admin
    .from("events")
    .select("id,event_type,city,status,quotes_delivered_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(MAX_ROWS);
  const events: EventStatRow[] = (data ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    city: e.city,
    status: e.status,
    quotesDeliveredAt: e.quotes_delivered_at,
  }));
  const ids = events.map((e) => e.id).slice(0, 1000);
  const paid = ids.length > 0
    ? await admin.from("payments").select("event_id").in("event_id", ids).in("status", ["paid", "confirmed"])
    : { data: [] as { event_id: string | null }[] };
  return {
    events,
    paidEventIds: new Set((paid.data ?? []).map((p) => p.event_id).filter((v): v is string => v !== null)),
  };
}
