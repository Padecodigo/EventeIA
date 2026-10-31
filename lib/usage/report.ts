import type { LlmProviderName } from "@/lib/ai/router";
import { DEFAULT_FX_BRL_PER_USD_MICRO, microUsdToBrlCents } from "@/lib/finance/pricing";
import { resolvePeriod } from "@/lib/finance/report";

import { isLegacyChannel, isProcessStage, type LegacyChannel, type ProcessStage } from "./stages";

/** Uma linha de llm_usage_events já enriquecida (usuário/canal herdados do evento quando ausentes). */
export interface UsageRow {
  at: string;
  provider: string;
  task: string;
  outcome: string;
  profileId: string | null;
  eventId: string | null;
  stage: ProcessStage | null;
  channel: LegacyChannel | null;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  costBrlCents: number;
}

export interface UsageFilters {
  from: string;
  to: string;
  task?: string;
  user?: string;
  stage?: ProcessStage | "none";
  channel?: LegacyChannel | "none";
  provider?: LlmProviderName;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z_]{2,40}$/;
const PROVIDERS: ReadonlySet<string> = new Set<LlmProviderName>(["nim", "grok", "deepseek"]);

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
function one(p: Params, k: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(k) ?? undefined : p[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

/** Search params → filtros validados (valores inválidos são ignorados, nunca vão para a query). */
export function parseUsageFilters(p: Params, now = new Date()): UsageFilters {
  const period = resolvePeriod(one(p, "from"), one(p, "to"), now);
  const f: UsageFilters = { ...period };
  const task = one(p, "task");
  if (task !== undefined && SLUG.test(task)) f.task = task;
  const user = one(p, "user");
  if (user !== undefined && UUID.test(user)) f.user = user.toLowerCase();
  const stage = one(p, "stage");
  if (stage === "none" || isProcessStage(stage)) f.stage = stage;
  const channel = one(p, "channel");
  if (channel === "none" || isLegacyChannel(channel)) f.channel = channel;
  const provider = one(p, "provider");
  if (provider !== undefined && PROVIDERS.has(provider)) f.provider = provider as LlmProviderName;
  return f;
}

/** Querystring canônica dos filtros (links de CSV/paginação). */
export function filtersToQuery(f: UsageFilters): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  for (const k of ["task", "user", "stage", "channel", "provider"] as const) {
    const v = f[k];
    if (v !== undefined) q.set(k, v);
  }
  return q.toString();
}

export function matchesFilters(r: UsageRow, f: UsageFilters): boolean {
  const day = r.at.slice(0, 10);
  if (day < f.from || day > f.to) return false;
  if (f.task !== undefined && r.task !== f.task) return false;
  if (f.user !== undefined && r.profileId !== f.user) return false;
  if (f.provider !== undefined && r.provider !== f.provider) return false;
  if (f.stage !== undefined && (f.stage === "none" ? r.stage !== null : r.stage !== f.stage)) return false;
  if (f.channel !== undefined && (f.channel === "none" ? r.channel !== null : r.channel !== f.channel)) return false;
  return true;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  costBrlCents: number;
}

export interface UsageGroup extends UsageTotals {
  task: string;
  profileId: string | null;
  stage: ProcessStage | null;
}

export interface UsageDay extends UsageTotals {
  day: string;
}

export interface UsageReport {
  totals: UsageTotals;
  byDay: UsageDay[];
  groups: UsageGroup[];
  tasks: string[];
}

const zero = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, costBrlCents: 0 });
function add(t: UsageTotals, r: UsageRow): void {
  t.calls += 1;
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.costMicroUsd += r.costMicroUsd;
  t.costBrlCents += r.costBrlCents;
}

/** Dias corridos [from, to] (UTC), para o gráfico não "pular" dias sem uso. */
export function daysBetween(from: string, to: string, max = 366): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (d.getTime() <= end && out.length < max) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Aplica os filtros e agrega: totais, série diária e grupos task × usuário × estágio (ordenados por custo). */
export function buildUsageReport(rows: readonly UsageRow[], f: UsageFilters): UsageReport {
  const totals = zero();
  const days = new Map(daysBetween(f.from, f.to).map((d) => [d, { day: d, ...zero() }]));
  const groups = new Map<string, UsageGroup>();
  const tasks = new Set<string>();
  for (const r of rows) {
    tasks.add(r.task);
    if (!matchesFilters(r, f)) continue;
    add(totals, r);
    const day = r.at.slice(0, 10);
    const d = days.get(day) ?? { day, ...zero() };
    add(d, r);
    days.set(day, d);
    const key = `${r.task}|${r.profileId ?? ""}|${r.stage ?? ""}`;
    const g = groups.get(key) ?? { task: r.task, profileId: r.profileId, stage: r.stage, ...zero() };
    add(g, r);
    groups.set(key, g);
  }
  return {
    totals,
    byDay: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    groups: [...groups.values()].sort((a, b) => b.costMicroUsd - a.costMicroUsd || b.calls - a.calls),
    tasks: [...tasks].sort(),
  };
}

/** Custo em BRL: o gravado na linha ou convertido pelo câmbio gravado/padrão (mesma regra do financeiro). */
export function rowBrlCents(costMicroUsd: number, costBrlCents: number | null, fxMicro: number | null): number {
  return costBrlCents ?? microUsdToBrlCents(costMicroUsd, fxMicro ?? DEFAULT_FX_BRL_PER_USD_MICRO);
}

export interface ClosedOutsideRow {
  eventId: string;
  at: string;
  stage: ProcessStage | null;
  channel: LegacyChannel | null;
}

/** Contagem de "fechamentos por fora" por estágio × canal. */
export function closedOutsideSummary(rows: readonly ClosedOutsideRow[]): { stage: ProcessStage | null; channel: LegacyChannel | null; count: number }[] {
  const m = new Map<string, { stage: ProcessStage | null; channel: LegacyChannel | null; count: number }>();
  for (const r of rows) {
    const k = `${r.stage ?? ""}|${r.channel ?? ""}`;
    const e = m.get(k) ?? { stage: r.stage, channel: r.channel, count: 0 };
    e.count += 1;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
