/**
 * Persistência das contas TikTok conectadas (server-only, service_role).
 * Tokens são gravados criptografados (AES-256-GCM) com TIKTOK_TOKEN_ENCRYPTION_KEY.
 * Sem a chave, a gravação/leitura falha fechada; nunca persiste token em claro.
 */

import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { TiktokEnvironment } from "./config";
import { decryptToken, deriveKey, protectToken } from "./encryption";

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
  if (!access.encrypted || !refresh.encrypted) {
    logger.error(
      { table: "tiktok_oauth_tokens", owner_profile_id: input.ownerProfileId },
      "TIKTOK_TOKEN_ENCRYPTION_KEY ausente — gravação de tokens TikTok bloqueada",
    );
    throw new Error(
      "TIKTOK_TOKEN_ENCRYPTION_KEY ausente — tokens do TikTok não podem ser gravados em claro",
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
      encrypted: true,
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

export type TiktokAccessTokenReason =
  "missing_account" | "not_encrypted" | "missing_key" | "decrypt_failed" | "expired";

export type TiktokAccessTokenResult =
  | {
      ok: true;
      accessToken: string;
      environment: TiktokEnvironment;
      accountId: string;
    }
  | { ok: false; reason: TiktokAccessTokenReason };

/**
 * Token da conta do ambiente ativo para upload de rascunho (server-only).
 * Nunca devolve o token criptografado; sem a chave correta falha fechado.
 */
export async function getActiveTiktokAccessToken(): Promise<TiktokAccessTokenResult> {
  const env = serverEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tiktok_oauth_tokens")
    .select("id,environment,access_token,encrypted,expires_at")
    .eq("environment", env.TIKTOK_ENV)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    logger.error({ error, table: "tiktok_oauth_tokens" }, "falha ao ler conta TikTok ativa");
    return { ok: false, reason: "missing_account" };
  }
  if (data === null) {
    return { ok: false, reason: "missing_account" };
  }

  if (data.expires_at !== null) {
    const expiresAt = Date.parse(data.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }

  // Credencial só é utilizável se foi persistida criptografada.
  if (!data.encrypted) {
    return { ok: false, reason: "not_encrypted" };
  }

  const key = deriveKey(env.TIKTOK_TOKEN_ENCRYPTION_KEY);
  if (key === null) {
    return { ok: false, reason: "missing_key" };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(data.access_token, key);
  } catch {
    logger.warn({ table: "tiktok_oauth_tokens" }, "falha ao descriptografar token TikTok");
    return { ok: false, reason: "decrypt_failed" };
  }

  if (!isConfigured(accessToken)) {
    return { ok: false, reason: "decrypt_failed" };
  }
  return {
    ok: true,
    accessToken,
    environment: data.environment,
    accountId: data.id,
  };
}
