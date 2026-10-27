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
      });
      if (error !== null) throw new Error(`falha ao registrar post (${error.code ?? "?"})`);
    },
  };
}
