import { describe, expect, it } from "vitest";

import { createSupabaseProspectingPostStore } from "@/lib/prospecting/event-post-store";
import { initialPublicationState } from "@/lib/prospecting/publication-state";

function row(updatedAt: string, state: ReturnType<typeof initialPublicationState>) {
  return {
    id: "p1",
    event_id: "ev1",
    event_code: "EVT-ABC",
    event_type: "casamento",
    event_date: "2026-11-01",
    city: null,
    region: null,
    caption: "x",
    image_url: null,
    image_params: { publication: state },
    status: "approved",
    ig_media_id: null,
    fb_post_id: null,
    error: null,
    published_at: null,
    updated_at: updatedAt,
  };
}

describe("CAS estrito do estado por canal", () => {
  it("writer B no mesmo ms faz o CAS antigo de A perder", async () => {
    let dbRow = row("2026-11-07T00:00:00.500Z", initialPublicationState());
    let firstRead = true;
    const store = createSupabaseProspectingPostStore({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (firstRead) {
                firstRead = false;
                return { data: dbRow };
              }
              return { data: dbRow };
            },
          }),
        }),
        update: (values: Record<string, unknown>) => {
          const filters: { column: string; value: string }[] = [];
          const query = {
            eq: (column: string, value: string) => {
              filters.push({ column, value });
              return query;
            },
            select: async () => {
              // Writer B grava no mesmo relógio e avança a versão/estado.
              dbRow = row("2026-11-07T00:00:00.501Z", {
                ...initialPublicationState(),
                instagram: { kind: "published", id: "17841400000000001" },
              });
              const matches = filters.every((filter) => {
                if (filter.column === "id") return filter.value === "p1";
                if (filter.column === "updated_at") {
                  return filter.value === dbRow.updated_at;
                }
                return true;
              });
              return matches ? { data: [{ id: "p1" }], error: null } : { data: [], error: null };
            },
          };
          void values;
          return query;
        },
      }),
    } as never);

    const result = await store.savePublicationState?.(
      "p1",
      {
        ...initialPublicationState(),
        instagram: { kind: "in_flight" },
      },
      initialPublicationState(),
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });

  it("updateStatus obsoleto não restaura id/estado removido", async () => {
    const removedState = {
      version: 1 as const,
      instagram: { kind: "removed" as const },
      facebook: { kind: "pending" as const },
    };
    const publishedState = {
      version: 1 as const,
      instagram: { kind: "published" as const, id: "17841400000000001" },
      facebook: { kind: "pending" as const },
    };
    const dbRow = {
      ...row("2026-11-07T00:00:00.900Z", removedState),
      ig_media_id: null,
    };
    let updateCalled = false;
    const store = createSupabaseProspectingPostStore({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: dbRow }) }),
        }),
        update: () => {
          updateCalled = true;
          const query = {
            eq: () => query,
            select: async () => ({ data: [{ id: "p1" }], error: null }),
          };
          return query;
        },
      }),
    } as never);

    const result = await store.updateStatus?.("p1", {
      status: "published",
      expectedPublicationState: publishedState,
    });

    expect(result).toMatchObject({ kind: "conflict" });
    expect(updateCalled).toBe(false);
    expect(dbRow.ig_media_id).toBeNull();
    expect(dbRow.image_params.publication.instagram).toEqual({ kind: "removed" });
  });
});

describe("upsert concorrente e marcador legado", () => {
  it("claim in_flight entre leitura e update faz upsert conflitar e preserva estado", async () => {
    const { PublicationConflictError } = await import("@/lib/prospecting/event-post-store");
    const dbRow = {
      ...row("2026-11-07T00:00:00.500Z", initialPublicationState()),
      image_params: {
        eventType: "casamento",
        publication: initialPublicationState(),
      },
    };
    let selectCalls = 0;
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              selectCalls += 1;
              return {
                data:
                  selectCalls === 1
                    ? { ...dbRow }
                    : {
                        ...dbRow,
                        updated_at: "2026-11-07T00:00:00.501Z",
                        image_params: {
                          ...dbRow.image_params,
                          publication: {
                            ...initialPublicationState(),
                            instagram: { kind: "in_flight" },
                          },
                        },
                      },
              };
            },
          }),
        }),
        update: () => {
          const filters: { column: string; value: string }[] = [];
          const query = {
            eq: (column: string, value: string) => {
              filters.push({ column, value });
              return query;
            },
            select: async () => {
              // Writer concorrente já mudou a versão/estado antes do CAS.
              const hasVersionFilter = filters.some((filter) => filter.column === "updated_at");
              if (hasVersionFilter) {
                dbRow.updated_at = "2026-11-07T00:00:00.501Z";
                dbRow.image_params = {
                  ...dbRow.image_params,
                  publication: {
                    ...initialPublicationState(),
                    instagram: { kind: "in_flight" },
                  },
                };
                return { data: [], error: null };
              }
              return { data: [dbRow], error: null };
            },
          };
          return query;
        },
      }),
    };

    const store = createSupabaseProspectingPostStore(db as never);
    await expect(
      store.upsert({
        eventId: "ev1",
        eventType: "casamento",
        eventDate: "2026-11-01",
        city: null,
        region: null,
      }),
    ).rejects.toBeInstanceOf(PublicationConflictError);
    expect(dbRow.updated_at).toBe("2026-11-07T00:00:00.501Z");
    expect(dbRow.image_params.publication.instagram).toEqual({ kind: "in_flight" });
  });

  it("23505 na inserção re-lê a linha vencedora sem sobrescrever", async () => {
    const winner = {
      ...row("2026-11-07T00:00:00.500Z", {
        ...initialPublicationState(),
        instagram: { kind: "in_flight" },
      }),
    };
    let selects = 0;
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              selects += 1;
              return { data: selects === 1 ? null : winner };
            },
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: "23505", message: "duplicate" },
            }),
          }),
        }),
      }),
    };

    const store = createSupabaseProspectingPostStore(db as never);
    const result = await store.upsert({
      eventId: "ev1",
      eventType: "casamento",
      eventDate: "2026-11-01",
      city: null,
      region: null,
    });
    expect(result.publicationState.instagram).toEqual({ kind: "in_flight" });
    expect(selects).toBe(2);
  });

  it("updateStatus não sobrescreve error manual_removal_required legado", async () => {
    const dbRow = {
      ...row("2026-11-07T00:00:00.500Z", initialPublicationState()),
      error: "manual_removal_required:https://instagram.com/p/legacy",
    };
    let updateValues: Record<string, unknown> | null = null;
    const store = createSupabaseProspectingPostStore({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: dbRow }) }),
        }),
        update: (values: Record<string, unknown>) => {
          updateValues = values;
          const query = {
            eq: () => query,
            select: async () => ({ data: [{ id: "p1" }], error: null }),
          };
          return query;
        },
      }),
    } as never);

    const result = await store.updateStatus("p1", {
      status: "failed",
      error: "novo erro",
      expectedPublicationState: initialPublicationState(),
    });
    expect(result).toEqual({ kind: "saved" });
    expect(updateValues).not.toHaveProperty("error");
  });
});
