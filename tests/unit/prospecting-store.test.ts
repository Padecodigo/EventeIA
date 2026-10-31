import { describe, expect, it } from "vitest";

import { createSupabaseProspectStore } from "@/lib/prospecting/supabase-store";

type StoreDb = Parameters<typeof createSupabaseProspectStore>[0];

/** Fake do client Supabase que emula o upsert atômico por (channel, external_user_id). */
function fakeDb() {
  const rows = new Map<string, { id: string; status: string }>();
  let seq = 0;
  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: null }) }),
        }),
        upsert: (values: Record<string, unknown>, opts: { onConflict: string }) => ({
          select: () => ({
            single: async () => {
              const key = opts.onConflict
                .split(",")
                .map((column) => String(values[column.trim()]))
                .join(":");
              const existing = rows.get(key);
              if (existing !== undefined) {
                return { data: { id: existing.id, status: existing.status } };
              }
              const row = { id: `c${String(++seq)}`, status: "open" };
              rows.set(key, row);
              return { data: { id: row.id, status: row.status } };
            },
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  };
  return { db, rows };
}

describe("createSupabaseProspectStore — criação concorrente", () => {
  it("duas criações concorrentes resolvem para a mesma conversa", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectStore(db as unknown as StoreDb);

    const [a, b] = await Promise.all([
      store.createConversation({ supplierId: "s1", channel: "instagram", externalUserId: "u1" }),
      store.createConversation({ supplierId: "s1", channel: "instagram", externalUserId: "u1" }),
    ]);

    expect(a.id).toBe(b.id);
    expect(rows.size).toBe(1);
  });

  it("canais diferentes criam conversas distintas", async () => {
    const { db, rows } = fakeDb();
    const store = createSupabaseProspectStore(db as unknown as StoreDb);

    const ig = await store.createConversation({ supplierId: "s1", channel: "instagram", externalUserId: "u1" });
    const msg = await store.createConversation({ supplierId: null, channel: "messenger", externalUserId: "u1" });

    expect(ig.id).not.toBe(msg.id);
    expect(rows.size).toBe(2);
  });
});
