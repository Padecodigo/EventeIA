import { z } from "zod";

import { logger } from "@/lib/logger";

/**
 * Resolve o remetente de uma DM do Instagram (IGSID) para um fornecedor
 * conhecido. Fundação do "interpretar + responder": o webhook recebe apenas o
 * IGSID; aqui buscamos o @username via Graph API e casamos com `suppliers.source_url`.
 */

export type MetaSupplier = { id: string; name: string; category: string } | null;

/** Interface mínima do client Supabase (injetável em testes). */
export interface MetaSupplierLookup {
  from(table: "suppliers"): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { id: string; name: string; category: string } | null }>;
      };
    };
  };
}

const usernameSchema = z.object({ username: z.string().min(1) });

export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}`;
}

/** @username (sem arroba) do usuário do Instagram, via Graph API; null se falhar. */
export async function instagramHandleFromSid(
  igSid: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/v21.0/${igSid}?fields=username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    logger.warn({ igSid, error: String(error) }, "instagram: falha de rede ao resolver @ do remetente");
    return null;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    logger.warn(
      { igSid, status: response.status, code: err?.code, message: err?.message },
      "instagram: Graph API recusou resolver @ do remetente",
    );
    return null;
  }
  const parsed = usernameSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ igSid }, "instagram: resposta da Graph API sem username");
    return null;
  }
  return parsed.data.username.toLowerCase();
}

/** Fornecedor pelo @handle (usado em comentários, onde o username já vem no payload). */
export async function resolveInstagramSupplierByHandle(
  db: MetaSupplierLookup,
  handle: string,
): Promise<MetaSupplier> {
  const normalized = handle.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const { data } = await db
    .from("suppliers")
    .select("id,name,category")
    .eq("source_url", instagramProfileUrl(normalized))
    .maybeSingle();
  return data ?? null;
}

/** Fornecedor conhecido cujo perfil bate com o IGSID; null se não houver match. */
export async function resolveInstagramSupplier(
  db: MetaSupplierLookup,
  igSid: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaSupplier> {
  const handle = await instagramHandleFromSid(igSid, accessToken, fetchImpl);
  if (handle === null) return null;
  const { data } = await db
    .from("suppliers")
    .select("id,name,category")
    .eq("source_url", instagramProfileUrl(handle))
    .maybeSingle();
  return data ?? null;
}
