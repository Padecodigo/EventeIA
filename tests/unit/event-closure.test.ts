import { describe, expect, it, vi } from "vitest";

import { runClosedReportPurge, runEventClosureSweep, type ClosureDb } from "@/lib/jobs/event-closure";

function fakeDb(opts: { closed?: string[]; posts?: { id: string; ig_media_id: string }[]; leftover?: number; error?: boolean } = {}) {
  const deletedRows: string[] = [];
  const rpcCalls: string[] = [];
  const chain = <T>(data: T) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "is"]) c[m] = () => c;
    c.limit = async () => ({ data, error: null });
    c.in = async () => ({ data, error: null });
    return c;
  };
  const db = {
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push(fn);
      if (opts.error === true) return { data: null, error: { code: "XX" } };
      if (fn === "auto_close_ready_events") return { data: opts.closed ?? [], error: null };
      if (fn === "purge_closed_event_posts") return { data: opts.leftover ?? 0, error: null };
      return { data: (args as { p_now: string }).p_now === "2026-12-24T03:00:00.000Z" ? 1 : 0, error: null };
    },
    from: (table: string) =>
      table === "events"
        ? chain([{ id: "ev1" }])
        : {
            ...chain(opts.posts ?? []),
            delete: () => ({
              eq: async (_c: string, id: string) => {
                deletedRows.push(id);
                return { error: null };
              },
            }),
          },
  } as unknown as ClosureDb;
  return { db, deletedRows, rpcCalls };
}

const meta = { igUserId: "ig", accessToken: "tok" };

describe("runEventClosureSweep", () => {
  it("encerra prontos, para o trabalho de fundo e apaga mídia antes da linha", async () => {
    const { db, deletedRows } = fakeDb({ closed: ["ev1"], posts: [{ id: "p1", ig_media_id: "m1" }], leftover: 2 });
    const stop = vi.fn(async () => undefined);
    const del = vi.fn(async () => ({ ok: true as const, id: "m1" }));
    const r = await runEventClosureSweep({ db, meta, stopBackgroundWork: stop, deleteMediaFn: del });
    expect(r).toEqual({ closed: ["ev1"], postsDeleted: 3 });
    expect(stop).toHaveBeenCalledWith("ev1");
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "m1" }));
    expect(deletedRows).toEqual(["p1"]);
  });

  it("regressão: falha ao apagar a mídia mantém a linha (worker tenta de novo)", async () => {
    const { db, deletedRows } = fakeDb({ posts: [{ id: "p1", ig_media_id: "m1" }] });
    await runEventClosureSweep({ db, meta, stopBackgroundWork: async () => undefined, deleteMediaFn: async () => ({ ok: false, error: "x", status: 500 }) });
    expect(deletedRows).toEqual([]);
  });

  it("sem Meta configurada não tenta apagar mídia", async () => {
    const { db } = fakeDb({ posts: [{ id: "p1", ig_media_id: "m1" }] });
    const del = vi.fn();
    await runEventClosureSweep({ db, meta: null, stopBackgroundWork: async () => undefined, deleteMediaFn: del });
    expect(del).not.toHaveBeenCalled();
  });

  it("erro na RPC propaga para o BullMQ repetir", async () => {
    const { db } = fakeDb({ error: true });
    await expect(runEventClosureSweep({ db, meta, stopBackgroundWork: async () => undefined })).rejects.toThrow();
  });
});

describe("runClosedReportPurge", () => {
  it("chama a RPC com o horário e devolve a contagem", async () => {
    const { db } = fakeDb();
    expect(await runClosedReportPurge(db, new Date("2026-12-24T03:00:00Z"))).toBe(1);
  });
});
