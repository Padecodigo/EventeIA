import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { evaluateBalance } from "./balances";

/** Provedores com saldo baixo/fôlego curto (para o banner do admin). Leitura via RLS (admin). */
export async function lowBalanceProviders(): Promise<{ provider: string; label: string; balanceBrlCents: number; runwayDays: number | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("provider_balances").select("provider,label,balance_brl_cents,threshold_brl_cents,runway_alert_days,daily_burn_brl_cents");
  return (data ?? []).flatMap((r) => {
    const ev = evaluateBalance({
      provider: r.provider,
      label: r.label,
      balanceBrlCents: r.balance_brl_cents,
      thresholdBrlCents: r.threshold_brl_cents,
      runwayAlertDays: r.runway_alert_days,
      dailyBurnBrlCents: r.daily_burn_brl_cents,
      lastAlertAt: null,
    });
    return ev.kind !== null && r.balance_brl_cents !== null
      ? [{ provider: r.provider, label: r.label, balanceBrlCents: r.balance_brl_cents, runwayDays: ev.runwayDays }]
      : [];
  });
}
