import { describe, expect, it, vi } from "vitest";

import { runEventClosureSweep, type ClosureDb } from "@/lib/jobs/event-closure";
import { BROWSER_MANUAL_IG_ID } from "@/lib/prospecting/browser-publication";
import { deleteFinishedProspectPosts } from "@/lib/prospecting/delete-posts";
import {
  deleteEventPublications,
  type PublicationCleanupDb,
  type PublicationRow,
  type PublicationTable,
} from "@/lib/prospecting/delete-publications";
import type {
  ProspectingPostStatusPatch,
  ProspectingPostStore,
} from "@/lib/prospecting/event-post-store";
import { publishEventPost } from "@/lib/prospecting/publish-event-post";
import { eventAllowsPublication } from "@/lib/prospecting/publish-guard";
import { publishPlannedPost } from "@/lib/prospecting/publish-runtime";

const meta = {
  igUserId: "ig-1",
  accessToken: "user-token",
  pageId: "page-1",
  pageAccessToken: "page-token",
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

function fakeStore() {
  const patches: { id: string; patch: ProspectingPostStatusPatch }[] = [];
  const store = {
    async updateStatus(id: string, patch: ProspectingPostStatusPatch) {
      patches.push({ id, patch });
      return { kind: "saved" as const };
    },
  } as Pick<ProspectingPostStore, "updateStatus">;
  return { store, patches };
}

const post = {
  id: "post-1",
  caption: "Estamos buscando fornecedores",
  imageUrl: "https://cdn/arte.jpg",
};

describe("publicação de evento nos dois canais", () => {
  it("sucesso grava id do Instagram e id do post da Página", async () => {
    const { store, patches } = fakeStore();
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });

    const outcome = await publishEventPost({
      post,
      approved: true,
      meta,
      store,
      requireFacebook: true,
      fetchImpl,
    });

    expect(outcome).toMatchObject({
      ok: true,
      mediaId: "17841400000000001",
      fbPostId: "page-1_fb-1",
    });
    expect(patches.at(-1)?.patch).toMatchObject({ status: "published" });
    expect(patches.at(-1)?.patch).not.toHaveProperty("igMediaId");
  });

  it("Facebook falhando não reporta sucesso e mantém o id do Instagram", async () => {
    const { store, patches } = fakeStore();
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?"))
        return { status: 500, body: { error: { message: "page boom" } } };
      return { body: {} };
    });

    const outcome = await publishEventPost({
      post,
      approved: true,
      meta,
      store,
      requireFacebook: true,
      fetchImpl,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("uncertain");
      expect(outcome.igMediaId).toBe("17841400000000001");
    }
    expect(outcome).toMatchObject({ ok: false, reason: "uncertain" });
  });

  it("falha de canal não vaza tokens na mensagem devolvida", async () => {
    const { store } = fakeStore();
    const secretMeta = {
      igUserId: "ig-1",
      accessToken: "secret-user-token",
      pageId: "page-1",
      pageAccessToken: "secret-page-token",
    };
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?"))
        return { status: 500, body: { error: { message: "page boom" } } };
      return { body: {} };
    });

    const outcome = await publishEventPost({
      post,
      approved: true,
      meta: secretMeta,
      store,
      requireFacebook: true,
      fetchImpl,
    });

    expect(outcome.ok).toBe(false);
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("secret-user-token");
    expect(serialized).not.toContain("secret-page-token");
  });

  it("retry publica só o Facebook quando o Instagram já tem id", async () => {
    const { store } = fakeStore();
    const { fetchImpl, calls } = fakeFetch((url) => {
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });

    const outcome = await publishEventPost({
      post: { ...post, igMediaId: "17841400000000001" },
      approved: true,
      meta,
      store,
      requireFacebook: true,
      fetchImpl,
    });

    expect(outcome).toMatchObject({
      ok: true,
      mediaId: "17841400000000001",
      fbPostId: "page-1_fb-1",
    });
    expect(calls.some((url) => url.includes("/media_publish"))).toBe(false);
    expect(calls.some((url) => url.includes("/photos?"))).toBe(true);
  });

  it("evento fechado durante a publicação persiste ids e dispara limpeza", async () => {
    const { store, patches } = fakeStore();
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("fields=status_code")) return { body: { status_code: "FINISHED" } };
      if (url.includes("/media?")) return { body: { id: "container-1" } };
      if (url.includes("/media_publish")) return { body: { id: "17841400000000001" } };
      if (url.includes("/photos?")) return { body: { id: "page-1_fb-1" } };
      return { body: {} };
    });
    const onEventClosed = vi.fn(async () => undefined);

    const outcome = await publishEventPost({
      post,
      approved: true,
      meta,
      store,
      requireFacebook: true,
      recheckEvent: async () => ({ status: "canceled" }),
      onEventClosed,
      fetchImpl,
    });

    expect(outcome).toMatchObject({
      ok: true,
      mediaId: "17841400000000001",
      fbPostId: "page-1_fb-1",
    });
    expect(onEventClosed).toHaveBeenCalledTimes(1);
    expect(patches.at(-1)?.patch).toMatchObject({ status: "published" });
    expect(patches.at(-1)?.patch).not.toHaveProperty("igMediaId");
  });

  it("evento cancelado/encerrado não republica (job atrasado)", async () => {
    const { store, patches } = fakeStore();
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const canceled = await publishEventPost({
      post,
      approved: true,
      meta,
      store,
      event: { status: "canceled" },
      fetchImpl,
    });
    const completed = await publishEventPost({
      post,
      approved: true,
      meta,
      store,
      event: { status: "completed", closed_at: "2026-11-06T12:00:00Z" },
      fetchImpl,
    });

    expect(canceled).toMatchObject({ ok: false, reason: "event_closed" });
    expect(completed).toMatchObject({ ok: false, reason: "event_closed" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(patches.every((p) => p.patch.status === "failed")).toBe(true);
  });

  it("bait também bloqueia publicação após encerramento", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const outcome = await publishPlannedPost({
      planned: { dayIndex: 0, category: "buffet", handles: [], imagePrompt: "x", caption: "x" },
      approved: true,
      modelslabKey: "k",
      meta,
      event: { status: "completed" },
      fetchImpl,
    });
    expect(outcome).toMatchObject({ ok: false, reason: "event_closed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function fakeCleanupDb(rows: {
  prospecting_posts: PublicationRow[];
  prospect_posts: PublicationRow[];
}) {
  const state = rows;
  const db = {
    from(table: PublicationTable) {
      return {
        select: () => ({
          eq: (column: string, value: string) => ({
            limit: async () => ({
              data: state[table].filter(
                (row) => String(row[column as keyof PublicationRow] ?? "") === value,
              ),
              error: null,
            }),
          }),
        }),
        delete: () => {
          const query = {
            eq: (column: string, value: string) => {
              if (column === "id") {
                state[table] = state[table].filter((row) => row[column] !== value);
              }
              return query;
            },
            select: async () => ({ data: [{ id: "deleted" }], error: null }),
            then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
          };
          return query;
        },
        update: (values: Record<string, unknown>) => {
          const query = {
            eq: (column: string, value: string) => {
              if (column === "id") {
                const row = state[table].find((item) => item[column] === value);
                if (row !== undefined) Object.assign(row, values);
              }
              return query;
            },
            select: async () => ({ data: [{ id: "updated" }], error: null }),
            then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
          };
          return query;
        },
      };
    },
  } as unknown as PublicationCleanupDb;
  return { db, state };
}

describe("limpeza idempotente de publicações do evento", () => {
  it("apaga post do evento e post de isca nos dois canais", async () => {
    const { db, state } = fakeCleanupDb({
      prospecting_posts: [{ id: "ep1", event_id: "ev1", ig_media_id: "1001", fb_post_id: "fb-ep" }],
      prospect_posts: [{ id: "bp1", event_id: "ev1", ig_media_id: "1002", fb_post_id: "fb-bp" }],
    });
    const delIg = vi.fn(async (input: { mediaId: string }) => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: input.mediaId,
    }));
    const delFb = vi.fn(async (input: { postId: string }) => ({
      kind: "deleted" as const,
      channel: "facebook" as const,
      id: input.postId,
    }));

    const result = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: delIg,
      deleteFacebookPostFn: delFb,
    });

    expect(result).toEqual({ removed: 4, rowsDeleted: 2, pending: 0 });
    expect(delIg.mock.calls.map(([i]) => i.mediaId)).toEqual(["1001", "1002"]);
    expect(delFb.mock.calls.map(([i]) => i.postId)).toEqual(["fb-ep", "fb-bp"]);
    expect(state.prospecting_posts).toHaveLength(0);
    expect(state.prospect_posts[0]?.deleted_at).toBeTruthy();
  });

  it("falha parcial mantém IDs/links e o retry termina a limpeza", async () => {
    const { db, state } = fakeCleanupDb({
      prospecting_posts: [{ id: "ep1", event_id: "ev1", ig_media_id: "1001", fb_post_id: "fb-ep" }],
      prospect_posts: [],
    });
    let igFails = true;
    const delIg = vi.fn(async (input: { mediaId: string }) =>
      igFails
        ? { kind: "unknown" as const, channel: "instagram" as const, error: "IG 2207085" }
        : { kind: "deleted" as const, channel: "instagram" as const, id: input.mediaId },
    );
    const delFb = vi.fn(async (input: { postId: string }) => ({
      kind: "deleted" as const,
      channel: "facebook" as const,
      id: input.postId,
    }));

    const first = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: delIg,
      deleteFacebookPostFn: delFb,
    });
    expect(first.pending).toBe(1);
    expect(state.prospecting_posts[0]).toMatchObject({ ig_media_id: "1001", fb_post_id: null });

    igFails = false;
    const second = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: delIg,
      deleteFacebookPostFn: delFb,
    });
    expect(second).toEqual({ removed: 1, rowsDeleted: 1, pending: 0 });
    expect(state.prospecting_posts).toHaveLength(0);
  });

  it("publicação do navegador não chama DELETE com shortcode e fica pendente com link", async () => {
    const permalink = "https://www.instagram.com/p/Cxyz123AbCd/";
    const { db, state } = fakeCleanupDb({
      prospecting_posts: [
        {
          id: "ep-browser",
          event_id: "ev1",
          ig_media_id: BROWSER_MANUAL_IG_ID,
          fb_post_id: null,
          image_params: {
            publication: {
              version: 1,
              instagram: { kind: "manual_removal", link: permalink },
              facebook: { kind: "pending" },
            },
          },
        },
      ],
      prospect_posts: [],
    });
    const delIg = vi.fn(async (input: { mediaId: string }) => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: input.mediaId,
    }));
    const delFb = vi.fn(async (input: { postId: string }) => ({
      kind: "deleted" as const,
      channel: "facebook" as const,
      id: input.postId,
    }));

    const result = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: delIg,
      deleteFacebookPostFn: delFb,
    });

    expect(delIg).not.toHaveBeenCalled();
    expect(result).toMatchObject({ removed: 0, rowsDeleted: 0, pending: 1 });
    expect(result.manualRemoval?.[0]).toMatchObject({
      table: "prospecting_posts",
      rowId: "ep-browser",
      link: permalink,
    });
    expect(state.prospecting_posts[0]).toMatchObject({ ig_media_id: BROWSER_MANUAL_IG_ID });
  });

  it("affectedRows data=null falha fechado e não conta linha apagada", async () => {
    const row: PublicationRow = {
      id: "ep-empty",
      event_id: "ev1",
      ig_media_id: null,
      fb_post_id: null,
      image_params: {
        publication: {
          version: 1,
          instagram: { kind: "pending" },
          facebook: { kind: "pending" },
        },
      },
      updated_at: "2026-11-07T00:00:00.000Z",
    };
    const db = {
      from: () => ({
        select: () => {
          const query = {
            eq: () => query,
            limit: async () => ({ data: [row], error: null }),
          };
          return query;
        },
        delete: () => {
          const query = {
            eq: () => query,
            select: async () => ({ data: null, error: null }),
            then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
          };
          return query;
        },
      }),
    } as unknown as PublicationCleanupDb;

    const result = await deleteEventPublications({ db, eventId: "ev1", meta });

    expect(result).toMatchObject({ rowsDeleted: 0, pending: 1 });
  });

  it("T0/T1: id salvo concorrentemente impede delete local e fica pending", async () => {
    const row: PublicationRow = {
      id: "ep1",
      event_id: "ev1",
      ig_media_id: "1001",
      fb_post_id: null,
      image_params: {
        publication: {
          version: 1,
          instagram: { kind: "published", id: "1001" },
          facebook: { kind: "pending" },
        },
      },
      updated_at: "2026-11-07T00:00:00.000Z",
    };
    let deleteCalled = false;
    let dbUpdatedAt = row.updated_at;
    const db = {
      from: () => ({
        select: () => {
          const query = {
            eq: () => query,
            limit: async () => ({ data: [row], error: null }),
          };
          return query;
        },
        update: (values: Record<string, unknown>) => {
          const query = {
            eq: (column: string, value: string) => {
              if (column === "updated_at" && value !== dbUpdatedAt) {
                query.affected = [];
              }
              if (column === "id" && query.affected.length > 0) {
                Object.assign(row, values);
                dbUpdatedAt =
                  typeof values.updated_at === "string" ? values.updated_at : dbUpdatedAt;
              }
              return query;
            },
            affected: [{ id: "ep1" }] as { id: string }[],
            select: async () => ({ data: query.affected, error: null }),
            then: (resolve: (value: unknown) => unknown) =>
              resolve({ data: query.affected, error: null }),
          };
          return query;
        },
        delete: () => {
          deleteCalled = true;
          const query = {
            eq: () => query,
            select: async () => ({ data: [{ id: "ep1" }], error: null }),
          };
          return query;
        },
      }),
    } as unknown as PublicationCleanupDb;

    const result = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: async () => {
        // Publicador salva o FB id entre o snapshot T0 e a remoção do IG.
        // O snapshot da linha continua em T0; o banco já está em T1.
        row.fb_post_id = "fb-new";
        dbUpdatedAt = "2026-11-07T00:01:00.000Z";
        return { kind: "deleted", channel: "instagram", id: "1001" };
      },
      deleteFacebookPostFn: async () => ({
        kind: "deleted",
        channel: "facebook",
        id: "fb-new",
      }),
    });

    expect(deleteCalled).toBe(false);
    expect(result.rowsDeleted).toBe(0);
    expect(result.pending).toBe(1);
    expect(row.fb_post_id).toBe("fb-new");
  });

  it("estado in_flight/uncertain sem id nunca é apagado localmente", async () => {
    const { db, state } = fakeCleanupDb({
      prospecting_posts: [
        {
          id: "ep1",
          event_id: "ev1",
          ig_media_id: null,
          fb_post_id: null,
          image_params: {
            publication: {
              version: 1,
              instagram: { kind: "uncertain", reason: "timeout" },
              facebook: { kind: "pending" },
            },
          },
          updated_at: "2026-11-07T00:00:00.000Z",
        },
      ],
      prospect_posts: [],
    });

    const result = await deleteEventPublications({ db, eventId: "ev1", meta });

    expect(result).toMatchObject({ rowsDeleted: 0, pending: 1 });
    expect(state.prospecting_posts).toHaveLength(1);
  });

  it("prospect_posts lê publication, preserva o outro canal e condiciona por updated_at", async () => {
    const updates: Record<string, unknown>[] = [];
    const expected: string[] = [];
    const row: PublicationRow = {
      id: "bp1",
      event_id: "ev1",
      ig_media_id: "1001",
      fb_post_id: "fb-bp",
      publication: {
        version: 1,
        instagram: { kind: "published", id: "1001" },
        facebook: { kind: "published", id: "fb-bp" },
      },
      updated_at: "2026-11-07T00:00:00.000Z",
    };
    const db = {
      from: (table: PublicationTable) => ({
        select: () => {
          const query = {
            eq: () => query,
            limit: async () => ({
              data: table === "prospect_posts" ? [row] : [],
              error: null,
            }),
          };
          return query;
        },
        update: (values: Record<string, unknown>) => {
          const query = {
            eq: (column: string, value: string) => {
              if (column === "updated_at") expected.push(value);
              if (column === "id") updates.push(values);
              return query;
            },
            then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
          };
          return query;
        },
      }),
    } as unknown as PublicationCleanupDb;

    const result = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: async () => ({
        kind: "deleted",
        channel: "instagram",
        id: "1001",
      }),
      deleteFacebookPostFn: async () => ({
        kind: "unknown",
        channel: "facebook",
        error: "fb timeout",
      }),
    });

    expect(result.pending).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        ig_media_id: null,
        publication: {
          version: 1,
          instagram: { kind: "removed" },
          facebook: { kind: "published", id: "fb-bp" },
        },
      }),
    );
    expect(expected).toContain("2026-11-07T00:00:00.000Z");
  });

  it("remoto já ausente é tratado como removido e a repetição é no-op", async () => {
    const { db, state } = fakeCleanupDb({
      prospecting_posts: [{ id: "ep1", event_id: "ev1", ig_media_id: "1001", fb_post_id: "fb-ep" }],
      prospect_posts: [],
    });
    const absent = vi.fn(async (input: { mediaId?: string; postId?: string }) => ({
      kind: "deleted" as const,
      channel: input.mediaId === undefined ? ("facebook" as const) : ("instagram" as const),
      id: input.mediaId ?? input.postId ?? "x",
    }));

    const first = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: absent,
      deleteFacebookPostFn: absent,
    });
    const second = await deleteEventPublications({
      db,
      eventId: "ev1",
      meta,
      deleteMediaFn: absent,
      deleteFacebookPostFn: absent,
    });

    expect(first).toEqual({ removed: 2, rowsDeleted: 1, pending: 0 });
    expect(second).toEqual({ removed: 0, rowsDeleted: 0, pending: 0 });
    expect(state.prospecting_posts).toHaveLength(0);
  });
});

describe("sweep de encerramento inclui canceled, completed e user_deleted", () => {
  it("limpa event posts e bait posts nos dois canais", async () => {
    const eventRows = [
      { id: "ev-completed", status: "completed", user_deleted_at: null },
      { id: "ev-canceled", status: "canceled", user_deleted_at: null },
      // user_deleted_at sozinho também entra na varredura (0075).
      {
        id: "ev-user-deleted",
        status: "active",
        user_deleted_at: "2026-11-06T12:00:00Z",
        report_purged_at: "2026-11-07T00:00:00Z",
      },
    ];
    const rows: Record<PublicationTable, PublicationRow[]> = {
      prospecting_posts: [
        { id: "ep1", event_id: "ev-completed", ig_media_id: "1101", fb_post_id: "fb-ep1" },
        { id: "ep2", event_id: "ev-canceled", ig_media_id: "1102", fb_post_id: "fb-ep2" },
        { id: "ep3", event_id: "ev-user-deleted", ig_media_id: "1103", fb_post_id: "fb-ep3" },
      ],
      prospect_posts: [
        { id: "bp1", event_id: "ev-completed", ig_media_id: "1201", fb_post_id: "fb-bp1" },
        { id: "bp2", event_id: "ev-canceled", ig_media_id: "1202", fb_post_id: "fb-bp2" },
        { id: "bp3", event_id: "ev-user-deleted", ig_media_id: "1203", fb_post_id: "fb-bp3" },
      ],
    };
    const eventsChain = {
      select: () => {
        let mode: "base" | "deleted" = "base";
        const query = {
          in: () => {
            mode = "base";
            return query;
          },
          is: () => query,
          not: () => {
            mode = "deleted";
            return query;
          },
          order: () => query,
          range: async (from: number, to: number) => ({
            data: eventRows
              .filter((row) =>
                mode === "deleted" ? row.user_deleted_at !== null : row.user_deleted_at === null,
              )
              .slice(from, to + 1),
            error: null,
          }),
        };
        return query;
      },
    };
    const db = {
      rpc: async (fn: string) => {
        if (fn === "auto_close_ready_events") return { data: [], error: null };
        if (fn === "purge_closed_event_posts") return { data: 0, error: null };
        return { data: 0, error: null };
      },
      from: (table: string) =>
        table === "events"
          ? eventsChain
          : {
              select: () => {
                const query = {
                  eq: (column: string, value: string) => {
                    queryValue = value;
                    return query;
                  },
                  is: () => query,
                  order: () => query,
                  range: async (from: number, to: number) => ({
                    data: rows[table as PublicationTable]
                      .filter((row) => row.event_id === queryValue)
                      .slice(from, to + 1),
                    error: null,
                  }),
                  limit: async () => ({
                    data: rows[table as PublicationTable].filter(
                      (row) => row.event_id === queryValue,
                    ),
                    error: null,
                  }),
                };
                let queryValue = "";
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
                  then: (resolve: (value: unknown) => unknown) =>
                    resolve({ data: null, error: null }),
                };
                return query;
              },
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
                  then: (resolve: (value: unknown) => unknown) =>
                    resolve({ data: null, error: null }),
                };
                return query;
              },
            },
    } as unknown as ClosureDb;

    const delIg = vi.fn(async (input: { mediaId: string }) => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: input.mediaId,
    }));
    const delFb = vi.fn(async (input: { postId: string }) => ({
      kind: "deleted" as const,
      channel: "facebook" as const,
      id: input.postId,
    }));

    const result = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: delIg,
      deleteFacebookPostFn: delFb,
    });

    expect(result.postsDeleted).toBe(6);
    expect(rows.prospecting_posts).toHaveLength(0);
    expect(rows.prospect_posts.every((row) => row.deleted_at !== undefined)).toBe(true);
  });
});

describe("limpeza dos posts de isca", () => {
  it("usa os dois canais e só marca deleted_at quando ambos foram removidos", async () => {
    let deletedAt: unknown = null;
    const db = {
      from: (table: string) =>
        table === "events"
          ? {
              select: () => ({
                in: async () => ({ data: [{ id: "ev1", status: "canceled" }], error: null }),
              }),
            }
          : {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: "bp1",
                          ig_media_id: "1201",
                          fb_post_id: "fb-bp1",
                          event_id: "ev1",
                          created_at: "2026-11-01T00:00:00Z",
                          tagged_handles: [],
                          contacted_handles: [],
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (values: Record<string, unknown>) => {
                const query = {
                  eq: () => query,
                  select: async () => {
                    if ("deleted_at" in values) deletedAt = values.deleted_at;
                    return { data: [{ id: "bp1" }], error: null };
                  },
                };
                return query;
              },
            },
    };
    const delIg = vi.fn(async (input: { mediaId: string }) => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: input.mediaId,
    }));
    const delFb = vi.fn(async (input: { postId: string }) => ({
      kind: "deleted" as const,
      channel: "facebook" as const,
      id: input.postId,
    }));

    const deleted = await deleteFinishedProspectPosts(
      {
        meta,
        now: new Date("2026-11-07T00:00:00Z"),
        deleteMediaFn: delIg,
        deleteFacebookPostFn: delFb,
      },
      db as never,
    );

    expect(deleted).toBe(1);
    expect(delIg).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "1201" }));
    expect(delFb).toHaveBeenCalledWith(expect.objectContaining({ postId: "fb-bp1" }));
    expect(deletedAt).toBe("2026-11-07T00:00:00.000Z");
  });

  it("falha parcial não marca deleted_at", async () => {
    let deletedAt: unknown = null;
    const channelUpdates: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) =>
        table === "events"
          ? {
              select: () => ({
                in: async () => ({ data: [{ id: "ev1", status: "completed" }], error: null }),
              }),
            }
          : {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: "bp1",
                          ig_media_id: "1201",
                          fb_post_id: "fb-bp1",
                          event_id: "ev1",
                          created_at: "2026-11-01T00:00:00Z",
                          tagged_handles: [],
                          contacted_handles: [],
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (values: Record<string, unknown>) => {
                const query = {
                  eq: () => query,
                  select: async () => {
                    channelUpdates.push(values);
                    if ("deleted_at" in values) deletedAt = values.deleted_at;
                    return { data: [{ id: "bp1" }], error: null };
                  },
                };
                return query;
              },
            },
    };

    const deleted = await deleteFinishedProspectPosts(
      {
        meta,
        now: new Date("2026-11-07T00:00:00Z"),
        deleteMediaFn: async () => ({
          kind: "unknown",
          channel: "instagram",
          error: "IG 2207085",
        }),
        deleteFacebookPostFn: async (input) => ({
          kind: "deleted",
          channel: "facebook",
          id: input.postId,
        }),
      },
      db as never,
    );

    expect(deleted).toBe(0);
    expect(deletedAt).toBeNull();
    expect(channelUpdates).toContainEqual(expect.objectContaining({ fb_post_id: null }));
  });
});

describe("guard do job enfileirado", () => {
  it("evento terminal ou apagado não permite publicar", async () => {
    const db = (status: string | null) => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                status === null
                  ? null
                  : { id: "ev1", status, closed_at: null, user_deleted_at: null },
            }),
          }),
        }),
      }),
    });
    await expect(eventAllowsPublication(db("active"), "ev1")).resolves.toBe(true);
    await expect(eventAllowsPublication(db("completed"), "ev1")).resolves.toBe(false);
    await expect(eventAllowsPublication(db("canceled"), "ev1")).resolves.toBe(false);
    await expect(eventAllowsPublication(db(null), "ev1")).resolves.toBe(false);
  });
});
