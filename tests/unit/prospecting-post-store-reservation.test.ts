import { describe, expect, it } from "vitest";

import { createSupabasePostStore } from "@/lib/prospecting/posts-store";

describe("reserva durável do post de isca", () => {
  it("trata 23505 re-selecionando a linha vencedora (sem segunda inserção)", async () => {
    let selects = 0;
    let inserts = 0;
    const existing = {
      id: "row-1",
      ig_media_id: null,
      fb_post_id: null,
      publication: {
        version: 1,
        instagram: { kind: "pending" },
        facebook: { kind: "pending" },
      },
      status: "approved" as const,
    };
    const query = {
      eq: () => query,
      contains: () => query,
      order: () => query,
      limit: () => ({
        maybeSingle: async () => {
          selects += 1;
          return { data: selects === 1 ? null : existing, error: null };
        },
      }),
    };
    const db = {
      from: () => ({
        select: () => query,
        insert: () => {
          inserts += 1;
          return {
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: "23505", message: "duplicate key" },
              }),
            }),
          };
        },
      }),
    };

    const store = createSupabasePostStore(db as never);
    const result = await store.reserve?.({
      planned: {
        dayIndex: 0,
        category: "buffet",
        handles: [],
        imagePrompt: "x",
        caption: "x",
      },
      eventId: "ev1",
      imageUrl: "https://cdn/x.jpg",
    });

    expect(result).toMatchObject({
      kind: "reserved",
      reservation: { id: "row-1", status: "approved" },
    });
    expect(inserts).toBe(1);
    expect(selects).toBe(2);
  });

  it("acervo geral filtra event_id nulo com is, não com eq", async () => {
    const calls: string[] = [];
    const query = {
      eq: (column: string) => {
        calls.push(`eq:${column}`);
        return query;
      },
      is: (column: string, value: null) => {
        calls.push(`is:${column}:${String(value)}`);
        return query;
      },
      contains: () => query,
      order: () => query,
      limit: () => ({
        maybeSingle: async () => ({
          data: {
            id: "acervo-1",
            ig_media_id: null,
            fb_post_id: null,
            publication: {},
            status: "approved",
          },
          error: null,
        }),
      }),
    };
    const db = {
      from: () => ({
        select: () => query,
      }),
    };

    const store = createSupabasePostStore(db as never);
    const result = await store.reserve?.({
      planned: {
        dayIndex: 1,
        category: "barman",
        handles: [],
        imagePrompt: "mesa",
        caption: "Acervo",
      },
      eventId: null,
      imageUrl: "https://cdn/fresh.jpg",
    });

    expect(result).toMatchObject({ kind: "reserved", reservation: { id: "acervo-1" } });
    expect(calls).toContain("is:event_id:null");
    expect(calls.some((call) => call.startsWith("eq:event_id"))).toBe(false);
  });
});
