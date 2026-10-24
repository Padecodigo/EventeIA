import "server-only";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { summarizeWelcomeOffers, WELCOME_CODE_PREFIX, type WelcomeSummary } from "./pure";

export interface WelcomeAdminData extends WelcomeSummary {
  discountGivenCents: number;
  revenueCents: number;
}

/** Somente admin (requireAdmin + RLS is_admin()). Nunca seleciona hashes. */
export async function loadWelcomeAdmin(period?: { from: string; to: string }): Promise<WelcomeAdminData> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  let offers = supabase.from("welcome_offers").select("source,created_at,expires_at,profile_id,redeemed_at").limit(20_000);
  let payments = supabase
    .from("payments")
    .select("amount_cents,discount_cents,status,created_at")
    .like("coupon_code", `${WELCOME_CODE_PREFIX}%`)
    .in("status", ["paid", "confirmed"])
    .limit(20_000);

  if (period !== undefined) {
    const to = `${period.to}T23:59:59.999Z`;
    offers = offers.gte("created_at", period.from).lte("created_at", to);
    payments = payments.gte("created_at", period.from).lte("created_at", to);
  }

  const [offersResult, paymentsResult] = await Promise.all([offers, payments]);
  const summary = summarizeWelcomeOffers(offersResult.data ?? [], new Date());
  const paid = paymentsResult.data ?? [];

  return {
    ...summary,
    discountGivenCents: paid.reduce((sum, p) => sum + p.discount_cents, 0),
    revenueCents: paid.reduce((sum, p) => sum + p.amount_cents, 0),
  };
}
