import { describe, expect, it, vi } from "vitest";

import {
  BROWSER_MANUAL_IG_ID,
  manualRemovalFromRow,
  persistBrowserEventPublication,
} from "@/lib/prospecting/browser-publication";
import { publicationHasRefs } from "@/lib/prospecting/publication-state";

describe("publicação pelo navegador", () => {
  it("persiste o permalink no JSON tipado e não grava shortcode em ig_media_id", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                image_params: { eventType: "casamento", eventCode: "EVT-ABC" },
                updated_at: "2026-11-07T11:59:59.000Z",
              },
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => {
          const query = {
            eq: () => query,
            select: async () => {
              updates.push(values);
              return { data: [{ id: "post-1" }], error: null };
            },
          };
          return query;
        },
      }),
    };

    await persistBrowserEventPublication(db as never, {
      postId: "post-1",
      permalink: "https://www.instagram.com/p/Cxyz123AbCd/",
      shortcode: "Cxyz123AbCd",
      now: new Date("2026-11-07T12:00:00Z"),
    });

    const update = updates[0] ?? {};
    expect(update.ig_media_id).toBe(BROWSER_MANUAL_IG_ID);
    expect(update.ig_media_id).not.toBe("Cxyz123AbCd");
    expect(update.error).toBeUndefined();
    expect(update.image_params).toMatchObject({
      eventType: "casamento",
      eventCode: "EVT-ABC",
      publication: {
        version: 1,
        instagram: {
          kind: "manual_removal",
          link: "https://www.instagram.com/p/Cxyz123AbCd/",
        },
        facebook: { kind: "pending" },
      },
    });
  });

  it("id não numérico legado vira remoção manual, sem DELETE na Graph", () => {
    expect(
      manualRemovalFromRow({ igMediaId: "Cxyz123AbCd", error: null, imageParams: null }),
    ).toMatchObject({ kind: "manual_removal", permalink: null });
    expect(
      manualRemovalFromRow({ igMediaId: "17841400000000000", error: null, imageParams: null }),
    ).toBeNull();
  });

  it("marcador legado no error e id não numérico contam como ref remota", () => {
    expect(
      publicationHasRefs({
        igMediaId: null,
        fbPostId: null,
        state: {
          version: 1,
          instagram: { kind: "removed" },
          facebook: { kind: "removed" },
        },
        error: "manual_removal_required:https://instagram.com/p/legacy",
      }),
    ).toBe(true);
    expect(publicationHasRefs({ igMediaId: BROWSER_MANUAL_IG_ID, state: null })).toBe(true);
    expect(publicationHasRefs({ igMediaId: "Cxyz123AbCd", state: null })).toBe(true);
  });

  it("estado tipado manual_removal tem precedência e mantém o link", () => {
    const manual = manualRemovalFromRow({
      igMediaId: BROWSER_MANUAL_IG_ID,
      imageParams: {
        publication: {
          version: 1,
          instagram: { kind: "manual_removal", link: "https://instagram.com/p/abc" },
          facebook: { kind: "pending" },
        },
      },
    });
    expect(manual).toMatchObject({
      kind: "manual_removal",
      permalink: "https://instagram.com/p/abc",
    });
  });
});

describe("limpeza de post de isca do navegador", () => {
  it("não chama Graph DELETE e mantém a linha", async () => {
    vi.resetModules();
    const { deleteFinishedProspectPosts } = await import("@/lib/prospecting/delete-posts");
    let updateCalled = false;
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
                          ig_media_id: BROWSER_MANUAL_IG_ID,
                          fb_post_id: null,
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
              update: () => {
                const query = {
                  eq: () => query,
                  select: async () => {
                    updateCalled = true;
                    return { data: [{ id: "bp1" }], error: null };
                  },
                };
                return query;
              },
            },
    };
    const delIg = vi.fn(async () => ({
      kind: "deleted" as const,
      channel: "instagram" as const,
      id: "x",
    }));

    const deleted = await deleteFinishedProspectPosts(
      {
        meta: { igUserId: "ig", accessToken: "tok" },
        now: new Date("2026-11-07T00:00:00Z"),
        deleteMediaFn: delIg,
      },
      db as never,
    );

    expect(deleted).toBe(0);
    expect(delIg).not.toHaveBeenCalled();
    expect(updateCalled).toBe(false);
  });
});
