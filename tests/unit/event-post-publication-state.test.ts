import { describe, expect, it } from "vitest";

import { createSupabaseProspectingPostStore } from "@/lib/prospecting/event-post-store";

describe("estado por canal do post de evento (CAS)", () => {
  it("salva image_params com updated_at esperado e retorna saved", async () => {
    const updates: Record<string, unknown>[] = [];
    let expectedUpdatedAt = "";
    const row = {
      id: "p1",
      event_id: "ev1",
      event_code: "EVT-ABC",
      event_type: "casamento",
      event_date: "2026-11-01",
      city: null,
      region: null,
      caption: "x",
      image_url: null,
      image_params: { eventType: "casamento" },
      status: "approved",
      ig_media_id: null,
      error: null,
      published_at: null,
      updated_at: "2026-11-07T00:00:00.000Z",
    };
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row }) }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            if (column === "id") {
              return {
                eq: (nextColumn: string, nextValue: string) => {
                  expectedUpdatedAt = nextValue;
                  return {
                    select: async () => {
                      updates.push(values);
                      return { data: [{ id: "p1" }], error: null };
                    },
                  };
                },
              };
            }
            return { select: async () => ({ data: null, error: null }) };
          },
        }),
      }),
    };

    const store = createSupabaseProspectingPostStore(db as never);
    const result = await store.savePublicationState?.("p1", {
      version: 1,
      instagram: { kind: "published", id: "17841400000000001" },
      facebook: { kind: "in_flight" },
    });

    expect(result).toEqual({ kind: "saved" });
    expect(expectedUpdatedAt).toBe("2026-11-07T00:00:00.000Z");
    expect(updates[0]).toMatchObject({
      status: "failed",
      ig_media_id: "17841400000000001",
      image_params: {
        eventType: "casamento",
        publication: {
          version: 1,
          instagram: { kind: "published", id: "17841400000000001" },
          facebook: { kind: "in_flight" },
        },
      },
    });
  });
});
