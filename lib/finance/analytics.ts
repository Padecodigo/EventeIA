import { PAID_STATUSES, type CostRow, type RevenueRow } from "./report";

export interface DayPoint {
  day: string;
  revenueCents: number;
  costCents: number;
}

/** Une receita líquida e custo por dia (YYYY-MM-DD), em ordem cronológica. */
export function revenueCostSeries(revenueByDay: readonly [string, number][], costByDay: readonly [string, number][]): DayPoint[] {
  const map = new Map<string, DayPoint>();
  const get = (day: string): DayPoint => {
    const cur = map.get(day) ?? { day, revenueCents: 0, costCents: 0 };
    map.set(day, cur);
    return cur;
  };
  for (const [d, v] of revenueByDay) get(d).revenueCents += v;
  for (const [d, v] of costByDay) get(d).costCents += v;
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export interface EventMargin {
  eventId: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

/** Margem por evento = receita líquida paga (sem estornos) − custos atribuídos ao evento. */
export function marginByEvent(costs: readonly CostRow[], revenue: readonly RevenueRow[]): EventMargin[] {
  const map = new Map<string, EventMargin>();
  const get = (id: string): EventMargin => {
    const cur = map.get(id) ?? { eventId: id, revenueCents: 0, costCents: 0, marginCents: 0 };
    map.set(id, cur);
    return cur;
  };
  for (const c of costs) if (c.eventId) get(c.eventId).costCents += c.costBrlCents;
  for (const r of revenue) if (r.eventId && PAID_STATUSES.has(r.status) && !r.refunded) get(r.eventId).revenueCents += r.netCents;
  for (const m of map.values()) m.marginCents = m.revenueCents - m.costCents;
  return [...map.values()].sort((a, b) => a.marginCents - b.marginCents);
}

export interface EventStatRow {
  id: string;
  eventType: string;
  city: string | null;
  status: string;
  quotesDeliveredAt: string | null;
}

const PAID_EVENT_STATUSES = new Set(["active", "completed"]);

export interface Funnel {
  created: number;
  paid: number;
  delivered: number;
}

/** Funil criado → pago → entregue. Pago = status ativo/concluído ou pagamento confirmado. */
export function eventFunnel(events: readonly EventStatRow[], paidEventIds: ReadonlySet<string>): Funnel {
  let paid = 0;
  let delivered = 0;
  for (const e of events) {
    const isPaid = PAID_EVENT_STATUSES.has(e.status) || paidEventIds.has(e.id);
    if (isPaid) paid += 1;
    if (isPaid && e.quotesDeliveredAt !== null) delivered += 1;
  }
  return { created: events.length, paid, delivered };
}

function countBy(values: readonly string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function eventsByType(events: readonly EventStatRow[]): [string, number][] {
  return countBy(events.map((e) => e.eventType));
}

export function eventsByCity(events: readonly EventStatRow[]): [string, number][] {
  return countBy(events.map((e) => (e.city?.trim() ? e.city.trim() : "Sem cidade")));
}

/* ---------------- Geometria SVG (sem dependências) ---------------- */

/** Pontos "x,y" para <polyline>, com y invertido (0 embaixo) e escala comum. */
export function polylinePoints(values: readonly number[], width: number, height: number, max: number): string {
  if (values.length === 0) return "";
  const top = Math.max(1, max);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : width / 2;
      const y = height - (Math.max(0, v) / top) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export interface DonutSlice {
  key: string;
  value: number;
  /** Fração 0–1. */
  fraction: number;
  /** stroke-dasharray / dashoffset para um círculo de circunferência `circumference`. */
  dash: string;
  offset: number;
}

export function donutSlices(rows: readonly [string, number][], circumference: number, maxSlices = 6): DonutSlice[] {
  const positive = rows.filter(([, v]) => v > 0);
  const head = positive.slice(0, maxSlices - 1);
  const rest = positive.slice(maxSlices - 1).reduce((s, [, v]) => s + v, 0);
  const all: [string, number][] = rest > 0 ? [...head, ["Outros", rest]] : positive.slice(0, maxSlices);
  const total = all.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return [];
  let acc = 0;
  return all.map(([key, value]) => {
    const fraction = value / total;
    const len = fraction * circumference;
    const slice = { key, value, fraction, dash: `${len.toFixed(2)} ${(circumference - len).toFixed(2)}`, offset: -acc };
    acc += len;
    return slice;
  });
}
