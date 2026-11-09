import { describe, expect, it, vi } from "vitest";

import { runEventClosureSweep, type ClosureDb } from "@/lib/jobs/event-closure";
import { deleteFacebookPost, deleteMedia, type MetaPublishConfig } from "@/lib/meta/publishing";
import type { PublicationRow, PublicationTable } from "@/lib/prospecting/delete-publications";
import {
  initialPublicationState,
  type PublicationState,
} from "@/lib/prospecting/publication-state";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";
import type { PostStore } from "@/lib/prospecting/posts-store";

const meta: MetaPublishConfig = {
  igUserId: "ig-1",
  accessToken: "user-token",
  pageId: "page-1",
  pageAccessToken: "page-token",
};

const planned = {
  dayIndex: 0,
  category: "buffet",
  handles: [],
  imagePrompt: "x",
  caption: "post do evento",
};

function fakeFetch(route: (url: string) => { status?: number; body: unknown }) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const result = route(url);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function productionStore(initial: PublicationState = initialPublicationState()) {
  let state = initial;
  let reserveCalls = 0;
  const saves: { status: string; state: PublicationState }[] = [];
  const store: PostStore = {
    async probe() {
      return { kind: "ready" };
    },
    async reserve() {
      reserveCalls += 1;
      return { kind: "reserved", reservation: { id: "row-1", state, status: "approved" } };
    },
    async saveState(_id, next, status) {
      state = next;
      saves.push({ status, state: next });
      return { kind: "saved" };
    },
    async record() {
      throw new Error("record() não deve ser usado no fluxo de produção");
    },
  };
  return { store, saves, reserveCalls: () => reserveCalls, state: () => state };
}

describe("integração publicação de isca + retry", () => {
  it("reserva UMA linha antes de publicar e retry reusa a mesma linha sem republicar o IG", async () => {
    let fbShouldFail = true;
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("modelslab.com")) {
        return { body: { status: "success", output: ["https://cdn/fresh.jpg"] } };
      }
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?"))
        return fbShouldFail
          ? { status: 400, body: { error: { message: "invalid caption" } } }
          : { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });
    const { store, reserveCalls, state } = productionStore();

    const first = await publishPlannedPost({
      planned,
      approved: true,
      meta,
      eventId: "ev1",
      requireFacebook: true,
      modelslabKey: "k",
      persistArt: () =>
        Promise.resolve({
          url: "https://cdn/fresh.jpg",
          expiresAt: new Date("2026-12-01T00:00:00Z"),
        }),
      store,
      fetchImpl,
    });
    expect(first).toMatchObject({
      ok: false,
      reason: "facebook_failed",
      igMediaId: "17841400000000001",
    });
    expect(state().instagram).toMatchObject({ kind: "published", id: "17841400000000001" });
    expect(state().facebook.kind).toBe("failed");
    const igCallsAfterFirst = calls.filter((url) => url.includes("/media_publish")).length;
    expect(igCallsAfterFirst).toBe(1);

    fbShouldFail = false;
    const second = await publishPlannedPost({
      planned,
      approved: true,
      meta,
      eventId: "ev1",
      requireFacebook: true,
      modelslabKey: "k",
      persistArt: () =>
        Promise.resolve({
          url: "https://cdn/fresh.jpg",
          expiresAt: new Date("2026-12-01T00:00:00Z"),
        }),
      store,
      fetchImpl,
    });

    expect(second).toMatchObject({
      ok: true,
      mediaId: "17841400000000001",
      fbPostId: "page-1_fb-1",
    });
    expect(reserveCalls()).toBe(2);
    expect(calls.filter((url) => url.includes("/media_publish")).length).toBe(1);
    expect(calls.filter((url) => url.includes("/photos?")).length).toBe(2);
  });

  it("schema sem fb_post_id/publication falha fechado antes de qualquer chamada remota", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { store, reserveCalls } = productionStore();
    store.probe = async () => ({
      kind: "migration_required",
      missing: ["fb_post_id", "publication"],
    });

    const outcome = await publishPlannedPost({
      planned,
      approved: true,
      meta,
      eventId: "ev1",
      requireFacebook: true,
      cachedArt: { url: "https://cdn/cache.jpg", expiresAt: new Date("2026-11-08T00:00:00Z") },
      store,
      fetchImpl,
    });

    expect(outcome).toMatchObject({ ok: false, reason: "migration_required" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(reserveCalls()).toBe(0);
  });
});

describe("integração sweep + Meta", () => {
  function fakeSweepDb(
    eventRows: { id: string; status: string; user_deleted_at: string | null }[],
    rows: Record<PublicationTable, PublicationRow[]>,
  ): ClosureDb {
    const eventQuery = {
      in: () => eventQuery,
      is: () => eventQuery,
      not: () => eventQuery,
      order: () => eventQuery,
      range: async (from: number, to: number) => ({
        data: eventRows.slice(from, to + 1),
        error: null,
      }),
    };
    return {
      rpc: async (fn: string) => {
        if (fn === "auto_close_ready_events") return { data: [], error: null };
        return { data: 0, error: null };
      },
      from: (table: string) => {
        if (table === "events") return { select: () => eventQuery };
        let eventId = "";
        const query = {
          eq: (column: string, value: string) => {
            if (column === "event_id") eventId = value;
            return query;
          },
          is: () => query,
          order: () => query,
          range: async (from: number, to: number) => ({
            data: rows[table as PublicationTable]
              .filter((row) => row.event_id === eventId)
              .slice(from, to + 1),
            error: null,
          }),
          limit: async () => ({
            data: rows[table as PublicationTable].filter((row) => row.event_id === eventId),
            error: null,
          }),
        };
        return {
          select: () => query,
          update: (values: Record<string, unknown>) => {
            const query = {
              eq: (column: string, value: string) => {
                if (column === "id") {
                  const row = rows[table as PublicationTable].find(
                    (item) => String(item[column as keyof PublicationRow] ?? "") === value,
                  );
                  if (row !== undefined) Object.assign(row, values);
                }
                return query;
              },
              select: async () => ({ data: [{ id: "updated" }], error: null }),
              then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
            };
            return query;
          },
          delete: () => {
            const query = {
              eq: (column: string, value: string) => {
                if (column === "id") {
                  rows[table as PublicationTable] = rows[table as PublicationTable].filter(
                    (row) => String(row[column as keyof PublicationRow] ?? "") !== value,
                  );
                }
                return query;
              },
              select: async () => ({ data: [{ id: "deleted" }], error: null }),
              then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
            };
            return query;
          },
        };
      },
    } as unknown as ClosureDb;
  }

  const eventRows = [{ id: "ev1", status: "canceled", user_deleted_at: null }];

  it("404 NÃO limpa refs; success:true limpa por canal e remove a linha", async () => {
    const rows: Record<PublicationTable, PublicationRow[]> = {
      prospecting_posts: [{ id: "ep1", event_id: "ev1", ig_media_id: "1001", fb_post_id: "fb-ep" }],
      prospect_posts: [],
    };
    const db = fakeSweepDb(eventRows, rows);

    const notFound = fakeFetch(() => ({ status: 404, body: { error: { message: "not found" } } }));
    const keep = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: async (input) => deleteMedia({ ...input, fetchImpl: notFound.fetchImpl }),
      deleteFacebookPostFn: async (input) =>
        deleteFacebookPost({ ...input, fetchImpl: notFound.fetchImpl }),
    });
    expect(keep.postsDeleted).toBe(0);
    expect(rows.prospecting_posts[0]).toMatchObject({
      ig_media_id: "1001",
      fb_post_id: "fb-ep",
    });

    const success = fakeFetch(() => ({ body: { success: true } }));
    const cleaned = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: async (input) => deleteMedia({ ...input, fetchImpl: success.fetchImpl }),
      deleteFacebookPostFn: async (input) =>
        deleteFacebookPost({ ...input, fetchImpl: success.fetchImpl }),
    });
    expect(cleaned.postsDeleted).toBe(1);
    expect(rows.prospecting_posts).toHaveLength(0);
  });

  it("falha de um canal limpa o outro e mantém só a ref restante", async () => {
    const rows: Record<PublicationTable, PublicationRow[]> = {
      prospecting_posts: [{ id: "ep1", event_id: "ev1", ig_media_id: "1001", fb_post_id: "fb-ep" }],
      prospect_posts: [],
    };
    const db = fakeSweepDb(eventRows, rows);
    const success = fakeFetch(() => ({ body: { success: true } }));
    const failing = fakeFetch(() => ({
      status: 400,
      body: { error: { message: "delete failed", error_subcode: 2207085 } },
    }));

    const result = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: async (input) => deleteMedia({ ...input, fetchImpl: failing.fetchImpl }),
      deleteFacebookPostFn: async (input) =>
        deleteFacebookPost({ ...input, fetchImpl: success.fetchImpl }),
    });

    expect(result.postsDeleted).toBe(0);
    expect(rows.prospecting_posts[0]).toMatchObject({
      ig_media_id: "1001",
      fb_post_id: null,
    });
  });
});
