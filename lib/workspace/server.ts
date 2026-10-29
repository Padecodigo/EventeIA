import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface WorkspaceView {
  id: string;
  name: string;
  plan_code: string;
}

/**
 * Garante que o usuário tenha um workspace padrão (idempotente).
 *
 * Cria apenas se ainda não existir — o painel logado chama isto no primeiro
 * acesso, então planos e créditos B2B ficam disponíveis para todo usuário sem
 * exigir o passo manual de "Criar meu workspace".
 *
 * Nunca lança: em falha devolve `null` e o painel segue funcionando (o botão
 * manual em /creditos continua como fallback).
 */
export async function ensureWorkspace(userId: string): Promise<WorkspaceView | null> {
  try {
    const admin = getSupabaseAdmin();

    const { data: existing, error: lookupError } = await admin
      .from("workspaces")
      .select("id,name,plan_code")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (lookupError !== null) {
      logger.warn({ code: lookupError.code }, "ensureWorkspace: falha ao consultar workspace");
      return null;
    }
    if (existing !== null) {
      return existing;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    const firstName = (profile?.display_name ?? "Meu").trim().split(/\s+/)[0] || "Meu";

    const { data: workspace, error: insertError } = await admin
      .from("workspaces")
      .insert({ owner_id: userId, name: `Ateliê de ${firstName}`, plan_code: "essencial" })
      .select("id,name,plan_code")
      .single();

    if (insertError !== null || workspace === null) {
      logger.warn({ code: insertError?.code }, "ensureWorkspace: falha ao criar workspace");
      return null;
    }

    const { error: memberError } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id: workspace.id, profile_id: userId, member_role: "owner" },
        { onConflict: "workspace_id,profile_id" },
      );

    if (memberError !== null) {
      logger.warn({ code: memberError.code }, "ensureWorkspace: falha ao registrar owner");
      // O workspace foi criado; o fallback manual cobre a correção do member.
    }

    return workspace;
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "ensureWorkspace falhou",
    );
    return null;
  }
}
