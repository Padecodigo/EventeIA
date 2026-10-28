import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Cache da arte do post: guarda a imagem no Storage por **1 hora** para os
 * reposts da mesma necessidade/evento e apaga depois (custo e storage baixos).
 */

import { ART_TTL_MS, artExpiresAt } from "./art-ttl";

export const ART_BUCKET = "prospecting-art";

/** Baixa a imagem gerada e guarda no Storage; devolve a URL pública + validade. */
export async function cacheArt(
  sourceUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; expiresAt: Date }> {
  const response = await fetchImpl(sourceUrl);
  if (!response.ok) throw new Error(`download da arte falhou (${String(response.status)})`);
  const bytes = Buffer.from(await response.arrayBuffer());

  const storage = getSupabaseAdmin().storage.from(ART_BUCKET);
  const path = `${randomUUID()}.jpg`;
  const { error } = await storage.upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error !== null) throw new Error(`upload da arte falhou (${error.message})`);

  const { data } = storage.getPublicUrl(path);
  return { url: data.publicUrl, expiresAt: artExpiresAt() };
}

/** Apaga do bucket tudo que passou de 1 hora. Devolve quantos objetos removeu. */
export async function purgeExpiredArt(now: Date = new Date()): Promise<number> {
  const storage = getSupabaseAdmin().storage.from(ART_BUCKET);
  const cutoff = now.getTime() - ART_TTL_MS;
  const { data } = await storage.list("", { limit: 1000 });
  const old = (data ?? [])
    .filter((file) => file.created_at !== null && new Date(file.created_at).getTime() < cutoff)
    .map((file) => file.name);
  if (old.length === 0) return 0;
  const { error } = await storage.remove(old);
  return error === null ? old.length : 0;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Sobe os bytes já gerados (ex.: NVIDIA) e devolve URL pública + validade de 1h. */
export async function storeArtBytes(
  bytes: Buffer,
  mime: string,
): Promise<{ url: string; expiresAt: Date }> {
  const storage = getSupabaseAdmin().storage.from(ART_BUCKET);
  const extension = EXT_BY_MIME[mime] ?? ".bin";
  const path = `${randomUUID()}${extension}`;
  const { error } = await storage.upload(path, bytes, { contentType: mime, upsert: false });
  if (error !== null) throw new Error(`upload da arte falhou (${error.message})`);
  const { data } = storage.getPublicUrl(path);
  return { url: data.publicUrl, expiresAt: artExpiresAt() };
}
