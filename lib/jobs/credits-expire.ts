import "server-only";

import { expiredRemainingCents } from "@/lib/credits";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface ExpiredGrant {
  id: number;
  workspace_id: string;
  amount_cents: number;
  expires_at: string;
  created_at: string;
}

interface ActiveLater {
  amount_cents: number;
  expires_at: string;
  created_at: string;
}

/**
 * Expiração diária de franquias (.context/COMMERCIAL_MODEL.md §3.3).
 * FIFO: créditos que vencem primeiro são consumidos primeiro; o restante de
 * uma franquia expirada = saldo atual − créditos ativos que vencem depois
 * (incluindo top-ups, que nunca expiram e por isso são consumidos por último).
 */
export async function runCreditsExpireSweep(): Promise<number> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: grants, error } = await admin
    .from("credit_ledger")
    .select("id,workspace_id,amount_cents,expires_at,created_at")
    .eq("entry_type", "grant")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(200);

  if (error !== null) {
    throw new Error(`expiração falhou ao listar franquias: ${error.message}`);
  }

  if (grants === null || grants.length === 0) {
    return 0;
  }

  const workspaces = [...new Set(grants.map((grant) => grant.workspace_id))];
  let expiredCount = 0;
  let expiredCents = 0;

  for (const workspaceId of workspaces) {
    // Saldo atual = balance_after do último lançamento.
    const { data: latest } = await admin
      .from("credit_ledger")
      .select("balance_after_cents")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let balance = latest?.balance_after_cents ?? 0;

    // Top-ups (nunca expiram) + franquias ainda ativas deste workspace.
    const [{ data: topups }, { data: activeGrants }] = await Promise.all([
      admin
        .from("credit_ledger")
        .select("amount_cents")
        .eq("workspace_id", workspaceId)
        .eq("entry_type", "topup"),
      admin
        .from("credit_ledger")
        .select("amount_cents,expires_at,created_at")
        .eq("workspace_id", workspaceId)
        .eq("entry_type", "grant")
        .gt("expires_at", nowIso),
    ]);

    const topupsTotal = (topups ?? []).reduce((sum, row) => sum + row.amount_cents, 0);
    const activeLater: ActiveLater[] = (activeGrants ?? []) as ActiveLater[];

    for (const grant of (grants as ExpiredGrant[]).filter((item) => item.workspace_id === workspaceId)) {
      const key = `expire:grant:${String(grant.id)}`;

      const { data: alreadyExpired } = await admin
        .from("credit_ledger")
        .select("id")
        .eq("idempotency_key", key)
        .limit(1)
        .maybeSingle();

      if (alreadyExpired !== null) {
        continue;
      }

      // Créditos ativos que vencem DEPOIS deste (ordem FIFO por expires_at, created_at).
      const laterTotal =
        topupsTotal +
        activeLater
          .filter(
            (row) =>
              row.expires_at > grant.expires_at ||
              (row.expires_at === grant.expires_at && row.created_at > grant.created_at),
          )
          .reduce((sum, row) => sum + row.amount_cents, 0);

      const remaining = expiredRemainingCents(balance, laterTotal);

      if (remaining > 0) {
        const { error: insertError } = await admin.from("credit_ledger").insert({
          workspace_id: workspaceId,
          entry_type: "expire",
          amount_cents: -remaining,
          balance_after_cents: 0,
          idempotency_key: key,
          note: "expiração de franquia não utilizada",
        });

        if (insertError === null) {
          balance -= remaining;
          expiredCount += 1;
          expiredCents += remaining;
        }
      }
    }
  }

  if (expiredCount > 0) {
    try {
      await emitFeed(getSupabaseAdmin(), {
        type: "credits.expired",
        actorType: "system",
        aggregateType: "workspace",
        aggregateId: workspaces[0] ?? "",
        payload: { credits_expired_cents: expiredCents, grants: expiredCount },
        correlationId: `credits-expire:${nowIso}`,
        source: "worker",
      });
    } catch {
      // feed não bloqueia a expiração
    }
  }

  logger.info({ expiredCount, expiredCents }, "expiração de créditos concluída");
  return expiredCount;
}
