import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { TERMS_VERSION, type TermsContext } from "./terms";

/**
 * Registra o aceite (data/hora + versão) em terms_acceptances (0041).
 * Grava com service_role; nunca lança — falha no registro não bloqueia o fluxo.
 */
export async function recordTermsAcceptance(
  profileId: string,
  context: TermsContext,
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("terms_acceptances")
      .insert({ profile_id: profileId, terms_version: TERMS_VERSION, context });
    if (error !== null) {
      logger.warn({ code: error.code, context }, "falha ao registrar aceite dos termos");
    }
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido", context },
      "falha ao registrar aceite dos termos",
    );
  }
}
