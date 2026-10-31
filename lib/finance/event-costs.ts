/**
 * Custo por evento (painel /admin/custos): custo total, receita, margem e detalhamento por ferramenta.
 * Puro (sem I/O). Centavos BRL inteiros.
 *
 * Real × estimado:
 * - DeepSeek/LLM: tokens reais devolvidos pela API × preço de tabela ⇒ REAL (calculado).
 * - Serper, Google Places, Resend: nº real de chamadas × preço de referência ⇒ ESTIMADO.
 * - Asaas: taxa real do webhook (netValue); sem ela, estimada (Pix R$ 0,99; cartão R$ 0,49 + 1,99%).
 */
import { PAID_STATUSES, type CostRow, type RevenueRow } from "./report";

/** Provedores medidos por contagem de chamadas × preço de referência. */
export const METERED_PROVIDERS = new Set(["serper", "google_places", "resend", "search", "fetch"]);
const LLM_PROVIDERS = new Set(["deepseek", "xai", "grok", "nim"]);

export const ASAAS_PIX_FEE_CENTS = 99;
export const ASAAS_CARD_FIXED_CENTS = 49;
export const ASAAS_CARD_BPS = 199;

/** Taxa Asaas estimada por meio de pagamento (promoção Pix R$ 0,99; cartão R$ 0,49 + 1,99%). */
export function estimateAsaasFeeCents(grossCents: number, billingType: string | undefined): number {
  if (grossCents <= 0 || billingType === "COURTESY") return 0;
  if (billingType === "CREDIT_CARD") return ASAAS_CARD_FIXED_CENTS + Math.round((Math.max(0, grossCents) * ASAAS_CARD_BPS) / 10_000);
  return ASAAS_PIX_FEE_CENTS;
}

/** O custo é estimado? Usa a marca gravada; se ausente (legado), infere pelo provedor. */
export function isEstimated(c: Pick<CostRow, "provider" | "kind" | "estimated">): boolean {
  if (c.estimated !== undefined) return c.estimated;
  return c.kind === "variable" && METERED_PROVIDERS.has(c.provider);
}

export interface ToolCost {
  provider: string;
  calls: number;
  cents: number;
  estimatedCents: number;
  /** "real" | "estimado" | "misto" */
  basis: "real" | "estimado" | "misto";
}

export interface EventCost {
  eventId: string;
  title: string;
  costCents: number;
  estimatedCents: number;
  revenueCents: number;
  marginCents: number;
  /** margem / receita em basis points (null sem receita). */
  marginBps: number | null;
  calls: number;
  lastAt: string | null;
  tools: ToolCost[];
}

export type EventCostSort = "custo" | "margem" | "receita" | "recente";
export const EVENT_COST_SORTS: readonly EventCostSort[] = ["custo", "margem", "receita", "recente"];
export function parseEventCostSort(v: unknown): EventCostSort {
  return typeof v === "string" && (EVENT_COST_SORTS as readonly string[]).includes(v) ? (v as EventCostSort) : "custo";
}

function basisOf(cents: number, estimatedCents: number, calls: number): ToolCost["basis"] {
  if (estimatedCents === 0) return "real";
  if (estimatedCents >= cents && calls > 0) return "estimado";
  return "misto";
}

export function buildEventCosts(
  costs: readonly CostRow[],
  revenue: readonly RevenueRow[],
  titles: Readonly<Record<string, string>>,
  sort: EventCostSort = "custo",
): EventCost[] {
  type Acc = { tools: Map<string, { calls: number; cents: number; est: number }>; revenue: number; lastAt: string | null };
  const map = new Map<string, Acc>();
  const get = (id: string): Acc => {
    const cur = map.get(id) ?? { tools: new Map(), revenue: 0, lastAt: null };
    map.set(id, cur);
    return cur;
  };
  const touch = (a: Acc, at: string) => {
    if (a.lastAt === null || at > a.lastAt) a.lastAt = at;
  };
  const addTool = (a: Acc, provider: string, calls: number, cents: number, estimated: boolean) => {
    const key = LLM_PROVIDERS.has(provider) && provider === "grok" ? "xai" : provider;
    const t = a.tools.get(key) ?? { calls: 0, cents: 0, est: 0 };
    t.calls += calls;
    t.cents += cents;
    if (estimated) t.est += cents;
    a.tools.set(key, t);
  };

  for (const c of costs) {
    if (c.eventId === null || c.kind === "fixed") continue;
    const a = get(c.eventId);
    addTool(a, c.provider, Math.max(0, c.quantity ?? 1), c.costBrlCents, isEstimated(c));
    touch(a, c.at);
  }
  for (const r of revenue) {
    if (r.eventId === null || !PAID_STATUSES.has(r.status) || r.refunded) continue;
    const a = get(r.eventId);
    a.revenue += r.grossCents;
    const known = r.feeKnown ?? r.feeCents > 0;
    const fee = known ? r.feeCents : estimateAsaasFeeCents(r.grossCents, r.billingType);
    if (known || fee > 0) addTool(a, "asaas", 1, fee, !known);
    touch(a, r.at);
  }

  const out: EventCost[] = [...map].map(([eventId, a]) => {
    const tools: ToolCost[] = [...a.tools]
      .map(([provider, t]) => ({ provider, calls: t.calls, cents: t.cents, estimatedCents: t.est, basis: basisOf(t.cents, t.est, t.calls) }))
      .sort((x, y) => y.cents - x.cents || x.provider.localeCompare(y.provider));
    const costCents = tools.reduce((s, t) => s + t.cents, 0);
    const marginCents = a.revenue - costCents;
    return {
      eventId,
      title: titles[eventId] ?? `evento ${eventId.slice(0, 8)}`,
      costCents,
      estimatedCents: tools.reduce((s, t) => s + t.estimatedCents, 0),
      revenueCents: a.revenue,
      marginCents,
      marginBps: a.revenue > 0 ? Math.round((marginCents * 10_000) / a.revenue) : null,
      calls: tools.reduce((s, t) => s + t.calls, 0),
      lastAt: a.lastAt,
      tools,
    };
  });
  const cmp: Record<EventCostSort, (x: EventCost, y: EventCost) => number> = {
    custo: (x, y) => y.costCents - x.costCents,
    margem: (x, y) => x.marginCents - y.marginCents,
    receita: (x, y) => y.revenueCents - x.revenueCents,
    recente: (x, y) => ((y.lastAt ?? "") > (x.lastAt ?? "") ? 1 : (y.lastAt ?? "") < (x.lastAt ?? "") ? -1 : 0),
  };
  return out.sort((x, y) => cmp[sort](x, y) || x.eventId.localeCompare(y.eventId));
}
