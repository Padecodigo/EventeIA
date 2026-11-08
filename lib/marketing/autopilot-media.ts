import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { MediaUse } from "./media-dedup";

/** Persistência do registro de mídia publicada pelo autopilot. */

export type AutopilotMediaKind = "post" | "story" | "reel";

export interface RecordMediaUseInput {
  mediaKey: string;
  kind: AutopilotMediaKind;
  theme: string;
  url: string;
}

/** Todas as mídias já usadas (chave + instante) — a tabela é pequena. */
export async function loadUsedMedia(): Promise<MediaUse[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("autopilot_media")
    .select("media_key, created_at");
  if (error !== null) throw new Error(`leitura do autopilot_media falhou (${error.message})`);
  return (data ?? []).map((row) => ({
    key: row.media_key,
    usedAtMs: new Date(row.created_at).getTime(),
  }));
}

/** Registra o uso de uma mídia (chamado DEPOIS de publicar). */
export async function recordMediaUse(input: RecordMediaUseInput): Promise<void> {
  const { error } = await getSupabaseAdmin().from("autopilot_media").insert({
    media_key: input.mediaKey,
    kind: input.kind,
    theme: input.theme,
    url: input.url,
  });
  if (error !== null) throw new Error(`gravação do autopilot_media falhou (${error.message})`);
}
