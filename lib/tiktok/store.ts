/**
 * Persistência das contas TikTok conectadas (server-only, service_role).
 * Tokens criptografados em repouso quando TIKTOK_TOKEN_ENCRYPTION_KEY existe;
 * senão em claro com `encrypted = false` (loga e segue — nunca falha o app).
 */

import "server-only";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { TiktokEnvironment } from "./config";
import { protectToken } from "./encryption";

/** Colunas seguras para exibição (nunca inclui access_token/refresh_token). */
export interface TiktokConnectedAccount {
  id: string;
  owner_profile_id: string;
  environment: TiktokEnvironment;
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  encrypted: boolean;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveTiktokAccountInput {
  ownerProfileId: string;
  environment: TiktokEnvironment;
  openId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: string | null;
}

/** Grava/atualiza a conta conectada (idempotente por owner + environment). */
export async function saveTiktokAccount(input: SaveTiktokAccountInput): Promise<void> {
  const key = serverEnv().TIKTOK_TOKEN_ENCRYPTION_KEY;
  const access = protectToken(input.accessToken, key);
  const refresh = protectToken(input.refreshToken, key);
  const encrypted = access.encrypted && refresh.encrypted;

  if (!encrypted) {
    logger.warn(
      { table: "tiktok_oauth_tokens", owner_profile_id: input.ownerProfileId },
      "TIKTOK_TOKEN_ENCRYPTION_KEY ausente — tokens do TikTok gravados em claro (encrypted=false)",
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tiktok_oauth_tokens").upsert(
    {
      owner_profile_id: input.ownerProfileId,
      environment: input.environment,
      open_id: input.openId,
      display_name: input.displayName,
      avatar_url: input.avatarUrl,
      access_token: access.value,
      refresh_token: refresh.value,
      encrypted,
      scopes: input.scopes,
      expires_at: input.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_profile_id,environment" },
  );

  if (error !== null) {
    logger.error({ error, table: "tiktok_oauth_tokens" }, "falha ao gravar conta TikTok");
    throw error;
  }
}

/** Lista contas conectadas para a página de admin (sem tokens). */
export async function listTiktokAccounts(): Promise<TiktokConnectedAccount[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tiktok_oauth_tokens")
    .select(
      "id,owner_profile_id,environment,open_id,display_name,avatar_url,encrypted,scopes,expires_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error !== null) {
    logger.error({ error, table: "tiktok_oauth_tokens" }, "falha ao listar contas TikTok");
    return [];
  }
  return data ?? [];
}
