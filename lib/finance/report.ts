/** Agregações puras do painel financeiro (centavos BRL inteiros). */

export interface CostRow {
  at: string;
  provider: string;
  reason: string;
  kind: "variable" | "fixed";
  eventId: string | null;
  costMicroUsd: number;
  costBrlCents: number;
  inputTokens: number;
  outputTokens: number;
  detail: string;
}

export interface RevenueRow {
  at: string;
  paymentId: string;
  clientId: string;
  clientLabel: string;
  plan: string;
  eventId: string | null;
  grossCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  refunded: boolean;
}

export const PAID_STATUSES = new Set(["paid", "confirmed"]);

type Totals = Record<string, number>;
const add = (m: Totals, k: string, v: number) => (m[k] = (m[k] ?? 0) + v);
const day = (iso: string) => iso.slice(0, 10);
const sortDesc = (m: Totals) => Object.entries(m).sort((a, b) => b[1] - a[1]);

export interface FinanceReport {
  costBrlCents: number;
  costMicroUsd: number;
  fixedBrlCents: number;
  variableBrlCents: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  refundedCents: number;
  profitCents: number;
  /** margem em basis points sobre a receita líquida (null sem receita) */
  marginBps: number | null;
  eventsWithCost: number;
  avgCostPerEventCents: number;
  byProvider: [string, number][];
  byReason: [string, number][];
  byEvent: [string, number][];
  costByDay: [string, number][];
  revenueByClient: [string, number][];
  revenueByPlan: [string, number][];
  revenueByDay: [string, number][];
  paymentsCount: number;
}

export function buildReport(costs: readonly CostRow[], revenue: readonly RevenueRow[]): FinanceReport {
  const byProvider: Totals = {};
  const byReason: Totals = {};
  const byEvent: Totals = {};
  const costByDay: Totals = {};
  let costBrlCents = 0;
  let costMicroUsd = 0;
  let fixedBrlCents = 0;
  for (const c of costs) {
    costBrlCents += c.costBrlCents;
    costMicroUsd += c.costMicroUsd;
    if (c.kind === "fixed") fixedBrlCents += c.costBrlCents;
    add(byProvider, c.provider, c.costBrlCents);
    add(byReason, c.reason, c.costBrlCents);
    add(costByDay, day(c.at), c.costBrlCents);
    if (c.eventId !== null) add(byEvent, c.eventId, c.costBrlCents);
  }

  const revenueByClient: Totals = {};
  const revenueByPlan: Totals = {};
  const revenueByDay: Totals = {};
  let grossCents = 0;
  let feeCents = 0;
  let netCents = 0;
  let refundedCents = 0;
  let paymentsCount = 0;
  for (const r of revenue) {
    if (r.refunded) {
      refundedCents += r.grossCents;
      continue;
    }
    if (!PAID_STATUSES.has(r.status)) continue;
    paymentsCount += 1;
    grossCents += r.grossCents;
    feeCents += r.feeCents;
    netCents += r.netCents;
    add(revenueByClient, r.clientLabel, r.netCents);
    add(revenueByPlan, r.plan, r.netCents);
    add(revenueByDay, day(r.at), r.netCents);
  }

  const profitCents = netCents - costBrlCents;
  const events = Object.keys(byEvent).length;
  const eventCost = Object.values(byEvent).reduce((s, v) => s + v, 0);
  return {
    costBrlCents,
    costMicroUsd,
    fixedBrlCents,
    variableBrlCents: costBrlCents - fixedBrlCents,
    grossCents,
    feeCents,
    netCents,
    refundedCents,
    profitCents,
    marginBps: netCents > 0 ? Math.round((profitCents * 10_000) / netCents) : null,
    eventsWithCost: events,
    avgCostPerEventCents: events > 0 ? Math.round(eventCost / events) : 0,
    byProvider: sortDesc(byProvider),
    byReason: sortDesc(byReason),
    byEvent: sortDesc(byEvent),
    costByDay: Object.entries(costByDay).sort(),
    revenueByClient: sortDesc(revenueByClient),
    revenueByPlan: sortDesc(revenueByPlan),
    revenueByDay: Object.entries(revenueByDay).sort(),
    paymentsCount,
  };
}

/** Taxa/líquido do Asaas: usa netValue do webhook; sem ele, taxa desconhecida = 0. */
export function asaasFeeFromPayload(grossCents: number, netValueBrl: number | undefined): { feeCents: number; netCents: number } {
  if (netValueBrl === undefined || !Number.isFinite(netValueBrl)) return { feeCents: 0, netCents: grossCents };
  const net = Math.min(grossCents, Math.max(0, Math.round(netValueBrl * 100)));
  return { feeCents: grossCents - net, netCents: net };
}

/** Período [from, to] em datas ISO (inclusive); padrão = mês corrente (UTC). */
export function resolvePeriod(from: string | undefined, to: string | undefined, now = new Date()): { from: string; to: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const f = from !== undefined && iso.test(from) ? from : first;
  const t = to !== undefined && iso.test(to) ? to : now.toISOString().slice(0, 10);
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}
