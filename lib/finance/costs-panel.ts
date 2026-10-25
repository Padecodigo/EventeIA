/** Agregações puras do painel de custos (/admin/custos). Centavos BRL inteiros; datas em SP (UTC-3). */
import { PAID_STATUSES, type CostRow, type RevenueRow } from "./report";

const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
export const spDay = (iso: string | Date): string => new Date(new Date(iso).getTime() + SP_OFFSET_MS).toISOString().slice(0, 10);
export const spMonth = (iso: string | Date): string => spDay(iso).slice(0, 7);

export interface MonthPoint {
  month: string;
  revenueNetCents: number;
  feeCents: number;
  costCents: number;
  marginCents: number;
  marginBps: number | null;
  events: number;
  costPerEventCents: number;
}

export interface CostsPanel {
  todayByProvider: [string, number][];
  monthByProvider: [string, number][];
  todayTotalCents: number;
  monthTotalCents: number;
  month: MonthPoint;
  trend: MonthPoint[];
}

const sortDesc = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Últimos `n` meses (YYYY-MM), do mais antigo ao atual. */
export function lastMonths(now: Date, n: number): string[] {
  const [y, m] = spMonth(now).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function buildCostsPanel(costs: readonly CostRow[], revenue: readonly RevenueRow[], now: Date, months = 6): CostsPanel {
  const today = spDay(now);
  const thisMonth = spMonth(now);
  const todayBy = new Map<string, number>();
  const monthBy = new Map<string, number>();
  const costByMonth = new Map<string, number>();
  const eventsByMonth = new Map<string, Set<string>>();
  for (const c of costs) {
    const mk = c.kind === "fixed" ? c.at.slice(0, 7) : spMonth(c.at);
    add(costByMonth, mk, c.costBrlCents);
    if (c.eventId !== null) eventsByMonth.set(mk, (eventsByMonth.get(mk) ?? new Set()).add(c.eventId));
    if (mk === thisMonth) add(monthBy, c.provider, c.costBrlCents);
    if (c.kind !== "fixed" && spDay(c.at) === today) add(todayBy, c.provider, c.costBrlCents);
  }
  const netByMonth = new Map<string, number>();
  const feeByMonth = new Map<string, number>();
  for (const r of revenue) {
    if (!PAID_STATUSES.has(r.status) || r.refunded) continue;
    const mk = spMonth(r.at);
    add(netByMonth, mk, r.netCents);
    add(feeByMonth, mk, r.feeCents);
  }
  // Taxa Asaas entra como custo do provedor "asaas" no mês corrente.
  const feeNow = feeByMonth.get(thisMonth) ?? 0;
  if (feeNow > 0) add(monthBy, "asaas", feeNow);
  for (const r of revenue) {
    if (PAID_STATUSES.has(r.status) && !r.refunded && r.feeCents > 0 && spDay(r.at) === today) add(todayBy, "asaas", r.feeCents);
  }

  const trend: MonthPoint[] = lastMonths(now, months).map((month) => {
    const revenueNetCents = netByMonth.get(month) ?? 0;
    const costCents = costByMonth.get(month) ?? 0;
    const events = eventsByMonth.get(month)?.size ?? 0;
    const marginCents = revenueNetCents - costCents;
    return {
      month,
      revenueNetCents,
      feeCents: feeByMonth.get(month) ?? 0,
      costCents,
      marginCents,
      marginBps: revenueNetCents > 0 ? Math.round((marginCents * 10_000) / revenueNetCents) : null,
      events,
      costPerEventCents: events > 0 ? Math.round(costCents / events) : 0,
    };
  });
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    todayByProvider: sortDesc(todayBy),
    monthByProvider: sortDesc(monthBy),
    todayTotalCents: sum(todayBy),
    monthTotalCents: sum(monthBy),
    month: trend[trend.length - 1] ?? trend[0],
    trend,
  };
}
