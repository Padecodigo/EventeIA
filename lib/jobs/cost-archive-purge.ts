import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Client = {
  rpc(fn: "purge_expired_cost_archive", args: { p_now?: string }): PromiseLike<{ data: number | null; error: { code?: string; message?: string } | null }>;
};

/** Job diário: apaga custos do arquivo morto com mais de 5 anos (0076). Idempotente. */
export async function runCostArchivePurge(client: Client = getSupabaseAdmin(), now: Date = new Date()): Promise<number> {
  const { data, error } = await client.rpc("purge_expired_cost_archive", { p_now: now.toISOString() });
  if (error !== null) {
    logger.error({ code: error.code }, "expurgo do arquivo morto falhou");
    throw new Error("expurgo do arquivo morto falhou");
  }
  const purged = data ?? 0;
  if (purged > 0) logger.info({ purged }, "arquivo morto: custos expirados apagados");
  return purged;
}
