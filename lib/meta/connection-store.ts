/**
 * Persistência da conexão Meta (Facebook Login + Página + Instagram) — server-only.
 * O token de usuário e o token de Página são gravados criptografados (AES-256-GCM)
 * com META_TOKEN_ENCRYPTION_KEY. Sem a chave, a gravação/leitura falha fechada;
 * nenhum token é persistido em claro e nenhum token vai para o log.
 */

import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken, deriveKey, encryptToken } from "@/lib/tiktok/encryption";

import type { ManagedPage } from "./graph-login";

/** Slot único de conexão Meta (uma Página por instalação). */
const PRIMARY_SLOT = "primary";

/** Resumo seguro para exibição (nunca inclui tokens). */
export interface MetaConnectionSummary {
  fbUserId: string;
  fbUserName: string | null;
  scopes: string[];
  userTokenExpiresAt: string | null;
  pageId: string | null;
  pageName: string | null;
  pagePictureUrl: string | null;
  igUserId: string | null;
  igUsername: string | null;
  updatedAt: string;
}

export interface SaveMetaUserGrantInput {
  connectedBy: string | null;
  fbUserId: string;
  fbUserName: string | null;
  userToken: string;
  userTokenExpiresAt: string | null;
  scopes: string[];
}

/** Credenciais efetivas da Página para chamar a Graph API. */
export interface MetaPageCredentials {
  pageId: string;
  pageAccessToken: string;
  igUserId: string | null;
  source: "conexao" | "ambiente";
}

/** Contexto armazenado da Página (somente colunas não sensíveis + token cifrado). */
interface StoredPageLookup {
  pageId: string | null;
  pageAccessToken: string | null;
  igUserId: string | null;
}

/** Deriva a chave de criptografia ou falha fechado (nunca grava em claro). */
function requireEncryptionKey(): Buffer {
  const key = deriveKey(serverEnv().META_TOKEN_ENCRYPTION_KEY);
  if (key === null) {
    logger.error(
      { table: "meta_connections" },
      "META_TOKEN_ENCRYPTION_KEY ausente — gravação de tokens da Meta bloqueada",
    );
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY ausente — tokens da Meta não podem ser gravados em claro",
    );
  }
  return key;
}

/**
 * Grava/atualiza a concessão de usuário (slot 'primary') e zera qualquer
 * seleção de Página/Instagram anterior — após um novo grant nada está escolhido.
 */
export async function saveMetaUserGrant(input: SaveMetaUserGrantInput): Promise<void> {
  const key = requireEncryptionKey();
  const encryptedUserToken = encryptToken(input.userToken, key);
  const now = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("meta_connections").upsert(
    {
      slot: PRIMARY_SLOT,
      connected_by: input.connectedBy,
      fb_user_id: input.fbUserId,
      fb_user_name: input.fbUserName,
      user_access_token: encryptedUserToken,
      user_token_expires_at: input.userTokenExpiresAt,
      scopes: input.scopes,
      page_id: null,
      page_name: null,
      page_picture_url: null,
      page_access_token: null,
      ig_user_id: null,
      ig_username: null,
      encrypted: true,
      updated_at: now,
    },
    { onConflict: "slot" },
  );

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao gravar conexão Meta");
    throw error;
  }
}

export interface SaveMetaPageSelectionInput {
  page: ManagedPage;
}

/** Grava a Página escolhida no slot 'primary' (token de Página cifrado). */
export async function saveMetaPageSelection(input: SaveMetaPageSelectionInput): Promise<void> {
  const key = requireEncryptionKey();
  const encryptedPageToken = encryptToken(input.page.accessToken, key);
  const now = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_connections")
    .update({
      page_id: input.page.id,
      page_name: input.page.name,
      page_picture_url: input.page.pictureUrl,
      page_access_token: encryptedPageToken,
      ig_user_id: input.page.igUserId,
      ig_username: input.page.igUsername,
      encrypted: true,
      updated_at: now,
    })
    .eq("slot", PRIMARY_SLOT)
    .select("slot");

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao gravar Página Meta");
    throw error;
  }

  if (data === null || data.length === 0) {
    logger.error(
      { table: "meta_connections" },
      "seleção de Página Meta sem conexão prévia (nenhuma linha atualizada)",
    );
    throw new Error("conexão Meta não encontrada para associar a Página");
  }
}

/** Resumo seguro da conexão (apenas colunas não sensíveis). */
export async function getMetaConnectionSummary(): Promise<MetaConnectionSummary | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_connections")
    .select(
      "fb_user_id,fb_user_name,scopes,user_token_expires_at,page_id,page_name,page_picture_url,ig_user_id,ig_username,updated_at",
    )
    .eq("slot", PRIMARY_SLOT)
    .maybeSingle();

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao ler resumo da conexão Meta");
    throw error;
  }

  if (data === null) return null;

  return {
    fbUserId: data.fb_user_id,
    fbUserName: data.fb_user_name,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    userTokenExpiresAt: data.user_token_expires_at,
    pageId: data.page_id,
    pageName: data.page_name,
    pagePictureUrl: data.page_picture_url,
    igUserId: data.ig_user_id,
    igUsername: data.ig_username,
    updatedAt: data.updated_at,
  };
}

/** Token de usuário em claro; null se faltar linha, chave ou falhar a decifragem. */
export async function getMetaUserToken(): Promise<string | null> {
  const key = deriveKey(serverEnv().META_TOKEN_ENCRYPTION_KEY);
  if (key === null) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_connections")
    .select("user_access_token")
    .eq("slot", PRIMARY_SLOT)
    .maybeSingle();

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao ler token de usuário Meta");
    return null;
  }

  if (data === null || data.user_access_token === null) return null;

  try {
    return decryptToken(data.user_access_token, key);
  } catch (error) {
    logger.error(
      { error, table: "meta_connections" },
      "falha ao decifrar token de usuário Meta",
    );
    return null;
  }
}

/** Remove a conexão Meta do slot 'primary'. */
export async function deleteMetaConnection(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("meta_connections").delete().eq("slot", PRIMARY_SLOT);

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao remover conexão Meta");
    throw error;
  }
}

/** Normaliza string opcional de credencial: trim e vazio => null. */
function normalizeCredential(value: string | undefined | null): string | null {
  if (value === null || !isConfigured(value)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide as credenciais efetivas da Página (função pura).
 * Prioriza o que foi salvo pela conexão (source "conexao"); senão usa o ambiente
 * (source "ambiente"); sem par Página+token válido, retorna null (fail-closed).
 */
export function pickPageCredentials(
  stored: {
    pageId: string | null;
    pageAccessToken: string | null;
    igUserId: string | null;
  } | null,
  env: {
    META_PAGE_ID?: string;
    META_PAGE_ACCESS_TOKEN?: string;
    META_INSTAGRAM_BUSINESS_ID?: string;
  },
): MetaPageCredentials | null {
  if (stored !== null) {
    const pageId = normalizeCredential(stored.pageId);
    const pageAccessToken = normalizeCredential(stored.pageAccessToken);
    if (pageId !== null && pageAccessToken !== null) {
      return {
        pageId,
        pageAccessToken,
        igUserId: normalizeCredential(stored.igUserId),
        source: "conexao",
      };
    }
  }

  const envPageId = normalizeCredential(env.META_PAGE_ID);
  const envPageAccessToken = normalizeCredential(env.META_PAGE_ACCESS_TOKEN);
  if (envPageId !== null && envPageAccessToken !== null) {
    return {
      pageId: envPageId,
      pageAccessToken: envPageAccessToken,
      igUserId: normalizeCredential(env.META_INSTAGRAM_BUSINESS_ID),
      source: "ambiente",
    };
  }

  return null;
}

/**
 * Credenciais efetivas da Página para uso no servidor. Lê a linha do banco,
 * decifra o token (qualquer falha faz o armazenado ser tratado como ausente)
 * e delega a decisão a pickPageCredentials.
 */
export async function resolveMetaPageCredentials(): Promise<MetaPageCredentials | null> {
  let stored: StoredPageLookup | null = null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_connections")
    .select("page_id,page_access_token,ig_user_id")
    .eq("slot", PRIMARY_SLOT)
    .maybeSingle();

  if (error !== null) {
    logger.error({ error, table: "meta_connections" }, "falha ao ler credenciais da Página Meta");
  } else if (data !== null) {
    let decryptedToken: string | null = null;
    if (data.page_access_token !== null) {
      const key = deriveKey(serverEnv().META_TOKEN_ENCRYPTION_KEY);
      if (key !== null) {
        try {
          decryptedToken = decryptToken(data.page_access_token, key);
        } catch (decryptError) {
          logger.error(
            { error: decryptError, table: "meta_connections" },
            "falha ao decifrar token da Página Meta",
          );
          decryptedToken = null;
        }
      }
    }

    stored = {
      pageId: data.page_id,
      pageAccessToken: decryptedToken,
      igUserId: data.ig_user_id,
    };
  }

  return pickPageCredentials(stored, serverEnv());
}
