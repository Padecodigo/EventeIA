import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import {
  buildEventPostContent,
  type EventPostImageParams,
  type EventPostSource,
} from "./event-post";

/**
 * Persistência dos posts de prospecção por evento (`prospecting_posts`).
 * O client é acessado por uma interface mínima injetável para permitir testes
 * sem Supabase/Redis reais — o mesmo padrão de `lib/outreach`.
 */

export type ProspectingPostStatus = "draft" | "pending_approval" | "approved" | "published" | "failed";

export interface ProspectingPostRecord {
  id: string;
  eventId: string;
  eventCode: string;
  eventType: string;
  eventDate: string;
  city: string | null;
  region: string | null;
  caption: string;
  imageUrl: string | null;
  imageParams: EventPostImageParams;
  status: ProspectingPostStatus;
  igMediaId: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface UpsertProspectingPostInput extends EventPostSource {
  imageUrl?: string | null;
  status?: ProspectingPostStatus;
}

export interface ProspectingPostStatusPatch {
  status: ProspectingPostStatus;
  igMediaId?: string | null;
  publishedAt?: string | null;
  error?: string | null;
  imageUrl?: string | null;
}

export interface ProspectingPostStore {
  findByEvent(eventId: string): Promise<ProspectingPostRecord | null>;
  findById(id: string): Promise<ProspectingPostRecord | null>;
  findByCode(code: string): Promise<ProspectingPostRecord | null>;
  findEventIdByCode(code: string): Promise<string | null>;
  upsert(input: UpsertProspectingPostInput): Promise<ProspectingPostRecord>;
  updateStatus(id: string, patch: ProspectingPostStatusPatch): Promise<void>;
}

interface ProspectingPostRow {
  id: string;
  event_id: string;
  event_code: string;
  event_type: string;
  event_date: string;
  city: string | null;
  region: string | null;
  caption: string;
  image_url: string | null;
  image_params: Json;
  status: ProspectingPostStatus;
  ig_media_id: string | null;
  error: string | null;
  published_at: string | null;
}

interface ProspectingPostDb {
  from(table: "prospecting_posts"): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: ProspectingPostRow | null }>;
      };
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates?: boolean },
    ): {
      select(columns: string): { single(): Promise<{ data: ProspectingPostRow | null }> };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { code?: string } | null }>;
    };
  };
}

const SELECT_COLUMNS =
  "id,event_id,event_code,event_type,event_date,city,region,caption,image_url,image_params,status,ig_media_id,error,published_at";

function toRecord(row: ProspectingPostRow): ProspectingPostRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    eventCode: row.event_code,
    eventType: row.event_type,
    eventDate: row.event_date,
    city: row.city,
    region: row.region,
    caption: row.caption,
    imageUrl: row.image_url,
    imageParams: row.image_params as unknown as EventPostImageParams,
    status: row.status,
    igMediaId: row.ig_media_id,
    error: row.error,
    publishedAt: row.published_at,
  };
}

export function createSupabaseProspectingPostStore(
  db: ProspectingPostDb = getSupabaseAdmin() as unknown as ProspectingPostDb,
): ProspectingPostStore {
  async function findBy(column: string, value: string): Promise<ProspectingPostRecord | null> {
    const { data } = await db.from("prospecting_posts").select(SELECT_COLUMNS).eq(column, value).maybeSingle();
    return data === null ? null : toRecord(data);
  }

  return {
    findByEvent: (eventId) => findBy("event_id", eventId),
    findById: (id) => findBy("id", id),
    findByCode: (code) => findBy("event_code", code.trim().toUpperCase()),

    async findEventIdByCode(code) {
      const post = await findBy("event_code", code.trim().toUpperCase());
      return post?.eventId ?? null;
    },

    async upsert(input) {
      const content = buildEventPostContent(input);
      const { data } = await db
        .from("prospecting_posts")
        .upsert(
          {
            event_id: input.eventId,
            event_code: content.eventCode,
            event_type: input.eventType,
            event_date: input.eventDate,
            city: input.city ?? null,
            region: input.region ?? null,
            caption: content.caption,
            image_url: input.imageUrl ?? null,
            image_params: content.imageParams,
            status: input.status ?? "draft",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id", ignoreDuplicates: false },
        )
        .select(SELECT_COLUMNS)
        .single();
      if (data === null) throw new Error("falha ao salvar post de prospecção do evento");
      return toRecord(data);
    },

    async updateStatus(id, patch) {
      const { error } = await db
        .from("prospecting_posts")
        .update({
          status: patch.status,
          ...(patch.igMediaId !== undefined ? { ig_media_id: patch.igMediaId } : {}),
          ...(patch.publishedAt !== undefined ? { published_at: patch.publishedAt } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error !== null) throw new Error(`falha ao atualizar post de prospecção (${error.code ?? "?"})`);
    },
  };
}
