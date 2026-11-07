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
      insert: (values: Row) => ({
        select: () => ({
          single: async () => {
            if (rows.some((row) => row.event_id === values.event_id)) {
              return { data: null, error: { code: "23505", message: "duplicate" } };
            }
            const row: Row = { id: `post-${String(rows.length + 1)}`, ...values };
            rows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      update: (values: Row) => {
        const filters: { column: string; value: string }[] = [];
        let matched: Row | undefined;
        const query = {
          eq: (column: string, value: string) => {
            filters.push({ column, value });
            return query;
          },
          select: async () => {
            matched = rows.find((item) =>
              filters.every((filter) => item[filter.column] === filter.value),
            );
            if (matched === undefined) return { data: [], error: null };
            Object.assign(matched, values);
            return { data: [matched], error: null };
          },
          then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
        };
        return query;
      },
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

  it("regenerar post publicado preserva publication state e ig_media_id", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert(source);
    rows[0] = {
      ...rows[0],
      status: "published",
      ig_media_id: "17841400000000001",
      image_params: {
        eventType: "casamento",
        publication: {
          version: 1,
          instagram: { kind: "published", id: "17841400000000001" },
          facebook: { kind: "published", id: "page-1_fb-1" },
        },
      },
    };

    await store.upsert({ ...source, city: "Jacareí" });

    expect(rows[0]).toMatchObject({
      ig_media_id: "17841400000000001",
      image_params: {
        publication: {
          instagram: { kind: "published", id: "17841400000000001" },
          facebook: { kind: "published", id: "page-1_fb-1" },
        },
      },
    });
  });

  it("resolve o evento pelo código público (entrada de DM)", async () => {
    const { db } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert(source);
    await expect(store.findEventIdByCode(post.eventCode)).resolves.toBe(source.eventId);
    await expect(store.findEventIdByCode(post.eventCode.toLowerCase())).resolves.toBe(
      source.eventId,
    );
    await expect(store.findEventIdByCode("EVT-NAOEXIST")).resolves.toBeNull();
  });

  it("atualiza o status e os dados da publicação", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectingPostStore(db as never);
    const post = await store.upsert(source);
    await store.updateStatus(post.id, {
      status: "published",
      publishedAt: "2026-10-31T12:00:00.000Z",
    });
    expect(rows[0]).toMatchObject({
      status: "published",
      published_at: "2026-10-31T12:00:00.000Z",
    });
    expect(rows[0]).not.toHaveProperty("ig_media_id");
  });
});
