import { describe, expect, it } from "vitest";

import { createSupabaseProspectingPostStore } from "@/lib/prospecting/event-post-store";

type Row = Record<string, unknown>;

function fakeDb() {
  const rows: Row[] = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => ({
            data: rows.find((row) => row[column] === value) ?? null,
          }),
        }),
      }),
      upsert: (values: Row) => ({
        select: () => ({
          single: async () => {
            const existing = rows.find((row) => row.event_id === values.event_id);
            if (existing !== undefined) {
              Object.assign(existing, values);
              return { data: existing };
            }
            const row: Row = { id: `post-${String(rows.length + 1)}`, ...values };
            rows.push(row);
            return { data: row };
          },
        }),
      }),
      update: (values: Row) => ({
        eq: async (column: string, value: string) => {
          const row = rows.find((item) => item[column] === value);
          if (row !== undefined) Object.assign(row, values);
          return { error: null };
        },
      }),
    }),
  };
  return { db, rows };
}

const source = {
  eventId: "aaaaaaaa-0000-4000-8000-000000000001",
  eventType: "casamento",
  eventDate: "2026-12-10",
  city: "Taubaté",
  region: "SP",
};

describe("persistência do post de prospecção", () => {
  it("faz upsert por evento com legenda e código gerados", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert({ ...source, imageUrl: "https://cdn/arte.jpg" });

    expect(post.eventId).toBe(source.eventId);
    expect(post.eventCode).toMatch(/^EVT-/);
    expect(post.caption).toContain("Estamos buscando fornecedores");
    expect(post.imageParams).toMatchObject({ eventType: "casamento", city: "Taubaté" });
    expect(rows).toHaveLength(1);
  });

  it("regenerar o post do mesmo evento atualiza a mesma linha", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const first = await store.upsert(source);
    const second = await store.upsert({ ...source, city: "Jacareí" });

    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(second.city).toBe("Jacareí");
  });

  it("resolve o evento pelo código público (entrada de DM)", async () => {
    const { db } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert(source);
    await expect(store.findEventIdByCode(post.eventCode)).resolves.toBe(source.eventId);
    await expect(store.findEventIdByCode(post.eventCode.toLowerCase())).resolves.toBe(source.eventId);
    await expect(store.findEventIdByCode("EVT-NAOEXIST")).resolves.toBeNull();
  });

  it("atualiza o status e os dados da publicação", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert(source);
    await store.updateStatus(post.id, {
      status: "published",
      igMediaId: "media-1",
      publishedAt: "2026-10-31T12:00:00.000Z",
    });
    expect(rows[0]).toMatchObject({
      status: "published",
      ig_media_id: "media-1",
      published_at: "2026-10-31T12:00:00.000Z",
    });
  });
});
