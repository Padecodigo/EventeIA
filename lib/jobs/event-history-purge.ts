import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PurgeClient = {
  rpc(
    fn: "purge_user_deleted_events",
    args: { p_now?: string },
  ): PromiseLike<{ data: number | null; error: { code?: string; message?: string } | null }>;
};

/**
 * Job diário: expurga o conteúdo dos eventos apagados pelo usuário há mais de
 * 30 dias (0075). Idempotente: eventos já expurgados são ignorados pela função.
 */
export async function runEventHistoryPurge(
  client: PurgeClient = getSupabaseAdmin() as unknown as PurgeClient,
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await client.rpc("purge_user_deleted_events", { p_now: now.toISOString() });
  if (error !== null) {
    logger.error({ code: error.code }, "expurgo do histórico de eventos falhou");
    throw new Error("expurgo do histórico de eventos falhou");
  }
  const purged = data ?? 0;
  if (purged > 0) logger.info({ purged }, "histórico de eventos expurgado");
  return purged;
}
