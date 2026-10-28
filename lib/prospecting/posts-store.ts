import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { PlannedPost } from "./publish-plan";

/**
 * Porta de persistência dos posts em `prospect_posts`.
 * O client é acessado por interface mínima enquanto os tipos gerados não
 * conhecem a migração 0053.
 */

export type PostStatus = "draft" | "pending_approval" | "approved" | "published" | "failed";

export interface RecordPostInput {
  planned: PlannedPost;
  status: PostStatus;
  imageUrl?: string;
  igMediaId?: string;
  error?: string;
  /** Evento de origem (necessidades) quando o plano é por evento. */
  eventId?: string;
}

export interface PostStore {
  record(input: RecordPostInput): Promise<void>;
}

interface PostDb {
  from(table: "prospect_posts"): {
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  };
}

export function createSupabasePostStore(
  db: PostDb = getSupabaseAdmin() as unknown as PostDb,
): PostStore {
  return {
    async record(input) {
      const { error } = await db.from("prospect_posts").insert({
        caption: input.planned.caption,
        image_url: input.imageUrl ?? null,
        categories: [input.planned.category],
        day_index: input.planned.dayIndex,
        status: input.status,
        ig_media_id: input.igMediaId ?? null,
        error: input.error ?? null,
        event_id: input.eventId ?? null,
      });
      if (error !== null) throw new Error(`falha ao registrar post (${error.code ?? "?"})`);
    },
  };
}

/** Interface mínima para buscar a imagem já gerada de um evento + necessidade. */
interface PostLookupDb {
  from(table: "prospect_posts"): {
    select(columns: string): {
      eq(column: string, value: string): {
        contains(column: string, value: string[]): {
          not(column: string, operator: string, value: null): {
            order(column: string, options: { ascending: boolean }): {
              limit(n: number): {
                maybeSingle(): Promise<{ data: { image_url: string | null } | null }>;
              };
            };
          };
        };
      };
    };
  };
}

/**
 * Imagem já gerada para o mesmo evento + necessidade (cache).
 * Só gera imagem nova quando muda o evento ou o tipo de fornecedor.
 */
export async function findImageFor(
  eventId: string,
  category: string,
  db: PostLookupDb = getSupabaseAdmin() as unknown as PostLookupDb,
): Promise<string | null> {
  const { data } = await db
    .from("prospect_posts")
    .select("image_url")
    .eq("event_id", eventId)
    .contains("categories", [category])
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.image_url ?? null;
}
