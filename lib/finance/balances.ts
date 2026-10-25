/** Saldos de provedores: regras puras (parse das APIs, runway, decisão de alerta). */
import { microUsdToBrlCents } from "./pricing";

export interface BalanceState {
  provider: string;
  label: string;
  balanceBrlCents: number | null;
  thresholdBrlCents: number;
  runwayAlertDays: number;
  dailyBurnBrlCents: number | null;
  lastAlertAt: string | null;
}

export interface BalanceEvaluation {
  low: boolean;
  lowRunway: boolean;
  runwayDays: number | null;
  alert: boolean;
  kind: "low_balance" | "low_runway" | null;
}

/** Re-alerta no máximo a cada 20h (o cheque é diário). */
export const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export function evaluateBalance(s: BalanceState, now: Date = new Date()): BalanceEvaluation {
  if (s.balanceBrlCents === null) return { low: false, lowRunway: false, runwayDays: null, alert: false, kind: null };
  const low = s.balanceBrlCents < s.thresholdBrlCents;
  const runwayDays =
    s.dailyBurnBrlCents !== null && s.dailyBurnBrlCents > 0 ? Math.max(0, s.balanceBrlCents) / s.dailyBurnBrlCents : null;
  const lowRunway = runwayDays !== null && runwayDays < s.runwayAlertDays;
  const cooled = s.lastAlertAt === null || now.getTime() - Date.parse(s.lastAlertAt) >= ALERT_COOLDOWN_MS;
  const kind = low ? "low_balance" : lowRunway ? "low_runway" : null;
  return { low, lowRunway, runwayDays, alert: kind !== null && cooled, kind };
}

/** Média diária (centavos) dos últimos N dias a partir das linhas de custo do provedor. */
export function dailyBurn(costBrlCents: readonly number[], days: number): number {
  if (days <= 0) return 0;
  return Math.round(costBrlCents.reduce((a, b) => a + b, 0) / days);
}

/** DeepSeek GET /user/balance → centavos BRL. */
export function parseDeepseekBalance(body: unknown, fxMicro: number): { cents: number; currency: string; raw: number } | null {
  const infos = (body as { balance_infos?: { currency?: string; total_balance?: string }[] } | null)?.balance_infos;
  if (!Array.isArray(infos) || infos.length === 0) return null;
  const pick = infos.find((i) => i.currency === "USD") ?? infos[0];
  const raw = Number(pick?.total_balance);
  if (!Number.isFinite(raw)) return null;
  const currency = pick?.currency ?? "USD";
  // CNY → USD aproximado (DeepSeek costuma devolver USD para contas internacionais).
  const usd = currency === "CNY" ? raw / 7.2 : raw;
  return { cents: microUsdToBrlCents(Math.round(usd * 1_000_000), fxMicro), currency, raw };
}

/** Asaas GET /finance/balance → centavos BRL. */
export function parseAsaasBalance(body: unknown): { cents: number; currency: string; raw: number } | null {
  const raw = Number((body as { balance?: unknown } | null)?.balance);
  if (!Number.isFinite(raw)) return null;
  return { cents: Math.round(raw * 100), currency: "BRL", raw };
}

/** Serper GET /account → créditos restantes → centavos BRL pelo preço por 1000. */
export function parseSerperBalance(body: unknown, per1kMicroUsd: number, fxMicro: number): { cents: number; currency: string; raw: number } | null {
  const raw = Number((body as { balance?: unknown } | null)?.balance);
  if (!Number.isFinite(raw)) return null;
  return { cents: microUsdToBrlCents(Math.round((raw * per1kMicroUsd) / 1000), fxMicro), currency: "credits", raw };
}

export function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function alertEmailText(items: { label: string; balanceBrlCents: number; runwayDays: number | null; kind: string }[]): string {
  const lines = items.map(
    (i) =>
      `• ${i.label}: saldo ${formatBrl(i.balanceBrlCents)}${i.runwayDays !== null ? ` (≈ ${i.runwayDays.toFixed(1)} dias de operação)` : ""} — ${i.kind === "low_balance" ? "abaixo do limite" : "fôlego < limite de dias"}`,
  );
  return `Atenção: saldo baixo em provedores da EventeIA.\n\n${lines.join("\n")}\n\nRecarregue para não interromper a operação. Painel: https://eventeia.com.br/admin/custos`;
}

/** Saldo de orçamento mensal (centavos): orçamento − gasto (pode ficar negativo = estourou). */
export function budgetRemaining(budgetCents: number, spentCents: number): number {
  return budgetCents - spentCents;
}
