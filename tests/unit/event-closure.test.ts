import { describe, expect, it, vi } from "vitest";

import {
  runClosedReportPurge,
  runEventClosureSweep,
  type ClosureDb,
} from "@/lib/jobs/event-closure";

function fakeDb(
  opts: {
    closed?: string[];
    posts?: { id: string; ig_media_id: string; fb_post_id?: string | null }[];
    error?: boolean;
  } = {},
) {
  const deletedRows: string[] = [];
  const rpcCalls: string[] = [];
  const eventRows = [
    {
      id: "ev1",
      status: "completed",
      user_deleted_at: null,
      report_purged_at: "2026-11-06T00:00:00Z",
    },
  ];

  const eventQuery = {
    in: () => eventQuery,
    is: () => {
      throw new Error("filtro report_purged_at não deve ser usado");
    },
    not: () => eventQuery,
    order: () => eventQuery,
    range: async () => ({
      data: opts.error === true ? null : eventRows,
      error: opts.error === true ? { code: "XX" } : null,
    }),
  };

  const postQuery = {
    eq: () => postQuery,
    is: () => postQuery,
    order: () => postQuery,
    range: async () => ({ data: opts.posts ?? [], error: null }),
    limit: async () => ({ data: opts.posts ?? [], error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: opts.posts ?? [], error: null }),
  };

  const db = {
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push(fn);
      if (opts.error === true) return { data: null, error: { code: "XX" } };
      if (fn === "auto_close_ready_events") return { data: opts.closed ?? [], error: null };
      return {
        data: (args as { p_now: string }).p_now === "2026-12-24T03:00:00.000Z" ? 1 : 0,
        error: null,
      };
    },
    from: (table: string) =>
      table === "events"
        ? { select: () => eventQuery }
        : {
            select: () => postQuery,
            update: () => {
              const query = {
                eq: () => query,
                select: async () => ({ data: [{ id: "p1" }], error: null }),
                then: (resolve: (value: unknown) => unknown) =>
                  resolve({ data: null, error: null }),
              };
              return query;
            },
            delete: () => {
              const query = {
                eq: (_column: string, id: string) => {
                  if (_column === "id") deletedRows.push(id);
                  return query;
                },
                select: async () => ({ data: [{ id: "deleted" }], error: null }),
                then: (resolve: (value: unknown) => unknown) =>
                  resolve({ data: null, error: null }),
              };
              return query;
            },
          },
  } as unknown as ClosureDb;
  return { db, deletedRows, rpcCalls };
}

const meta = { igUserId: "ig", accessToken: "tok" };

describe("runEventClosureSweep", () => {
  it("encerra prontos, para o trabalho de fundo e apaga mídia antes da linha", async () => {
    const { db, deletedRows } = fakeDb({
      closed: ["ev1"],
      posts: [{ id: "p1", ig_media_id: "1" }],
    });
    const stop = vi.fn(async () => undefined);
    const del = vi.fn(async () => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: "1",
    }));
    const r = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: stop,
      deleteMediaFn: del,
    });
    expect(r).toEqual({ closed: ["ev1"], postsDeleted: 1 });
    expect(stop).toHaveBeenCalledWith("ev1");
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "1" }));
    expect(deletedRows).toEqual(["p1"]);
  });

  it("regressão: falha ao apagar a mídia mantém a linha (worker tenta de novo)", async () => {
    const { db, deletedRows } = fakeDb({ posts: [{ id: "p1", ig_media_id: "1" }] });
    await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: async () => ({
        kind: "transient",
        channel: "instagram",
        error: "x",
      }),
    });
    expect(deletedRows).toEqual([]);
  });

  it("sem Meta configurada não tenta apagar mídia", async () => {
    const { db } = fakeDb({ posts: [{ id: "p1", ig_media_id: "1" }] });
    const del = vi.fn();
    await runEventClosureSweep({
      db,
      meta: null,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: del,
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("não chama mais a RPC perigosa purge_closed_event_posts", async () => {
    const { db, rpcCalls } = fakeDb();
    await runEventClosureSweep({ db, meta, stopBackgroundWork: async () => undefined });
    expect(rpcCalls).not.toContain("purge_closed_event_posts");
  });

  it("pagina a varredura e ainda encontra evento depois da primeira página", async () => {
    const eventRows = Array.from({ length: 201 }, (_, index) => ({
      id: `ev${String(index).padStart(3, "0")}`,
      status: "completed",
      user_deleted_at: null,
    }));
    const deletedRows: string[] = [];
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
    const db = {
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
            data:
              eventId === "ev200"
                ? [{ id: "p200", event_id: "ev200", ig_media_id: "1" }].slice(from, to + 1)
                : [],
            error: null,
          }),
        };
        return {
          select: () => query,
          update: () => {
            const query = {
              eq: () => query,
              select: async () => ({ data: [{ id: "p200" }], error: null }),
              then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
            };
            return query;
          },
          delete: () => {
            const query = {
              eq: (_column: string, id: string) => {
                if (_column === "id") deletedRows.push(id);
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

    const result = await runEventClosureSweep({
      db,
      meta,
      stopBackgroundWork: async () => undefined,
      deleteMediaFn: async () => ({ kind: "deleted", channel: "instagram", id: "1" }),
    });

    expect(result.postsDeleted).toBe(1);
    expect(deletedRows).toEqual(["p200"]);
  });

  it("erro na RPC propaga para o BullMQ repetir", async () => {
    const { db } = fakeDb({ error: true });
    await expect(
      runEventClosureSweep({ db, meta, stopBackgroundWork: async () => undefined }),
    ).rejects.toThrow();
  });
});

describe("runClosedReportPurge", () => {
  it("chama a RPC com o horário e devolve a contagem", async () => {
    const { db } = fakeDb();
    expect(await runClosedReportPurge(db, new Date("2026-12-24T03:00:00Z"))).toBe(1);
  });
});
