/** Regras puras: vencimento da VPS, estimativa do Google Places e custos fixos recorrentes. */

export const VPS_DEFAULT_MONTHLY_CENTS = 10_000;
export const PLACES_FREE_CALLS_PER_MONTH = 1_000;

const DAY = 86_400_000;

/** Dias até o vencimento (datas no calendário de Brasília). Alerta quando faltar ≤ alertDays. */
export function renewalStatus(renewalDate: string | null, now: Date, alertDays: number): { daysLeft: number | null; alert: boolean } {
  if (renewalDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return { daysLeft: null, alert: false };
  const today = brDate(now);
  const daysLeft = Math.round((Date.parse(`${renewalDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  return { daysLeft, alert: daysLeft <= alertDays };
}

export function brDate(now: Date): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export interface PlacesMonth {
  calls: number;
  freeCalls: number;
  billableCalls: number;
  costCents: number;
  projectedCalls: number;
  projectedCents: number;
  budgetCents: number | null;
  budgetUsedPct: number | null;
  overBudget: boolean;
}

/** Gasto estimado do mês do Google Places: (chamadas − franquia) × preço por chamada, projetado até o fim do mês. */
export function placesMonth(input: { calls: number; unitCents: number; now: Date; budgetCents: number | null; freeCalls?: number }): PlacesMonth {
  const free = input.freeCalls ?? PLACES_FREE_CALLS_PER_MONTH;
  const [y, m, d] = brDate(input.now).split("-").map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const billable = Math.max(0, input.calls - free);
  const costCents = Math.round(billable * input.unitCents);
  const projectedCalls = Math.round((input.calls / d) * daysInMonth);
  const projectedCents = Math.round(Math.max(0, projectedCalls - free) * input.unitCents);
  const budget = input.budgetCents;
  return {
    calls: input.calls,
    freeCalls: free,
    billableCalls: billable,
    costCents,
    projectedCalls,
    projectedCents,
    budgetCents: budget,
    budgetUsedPct: budget ? Math.round((projectedCents / budget) * 1000) / 10 : null,
    overBudget: budget !== null && projectedCents > budget,
  };
}

export interface RecurringRow { id: string; provider: string; note: string | null; occurred_at: string; recurring: boolean }

/** Custos fixos marcados "repete todo mês" que ainda não têm lançamento no mês corrente (um por fornecedor+nome). */
export function recurringDue(rows: readonly RecurringRow[], currentMonth: string): RecurringRow[] {
  const latest = new Map<string, RecurringRow>();
  for (const r of rows) {
    const key = `${r.provider}|${(r.note ?? "").split(" · ")[0]}`;
    const prev = latest.get(key);
    if (!prev || r.occurred_at > prev.occurred_at) latest.set(key, r);
  }
  return [...latest.values()].filter((r) => r.recurring && r.occurred_at.slice(0, 7) < currentMonth);
}
