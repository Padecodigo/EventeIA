import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => Promise.resolve({ id: "admin-1" }) }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://eventeia.test",
    META_ACCESS_TOKEN: "token",
    META_INSTAGRAM_BUSINESS_ID: "ig-1",
    META_PAGE_ID: "page-1",
    META_PAGE_ACCESS_TOKEN: "page-token",
    META_API_VERSION: "v26.0",
    META_API_HOST: "graph.facebook.com",
    INSTAGRAM_PROVIDER: "graph",
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              event_type: "casamento",
              event_date: "2026-11-01",
              city: "Taubaté",
              city_uf: "SP",
              region_code: "SP",
              confirmed_at: "2026-10-01T00:00:00Z",
              status: "active",
              closed_at: null,
              user_deleted_at: null,
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/prospecting/looking-for", () => ({
  loadLookingFor: () => Promise.resolve([]),
}));
vi.mock("@/lib/prospecting/event-post-store", () => {
  class PublicationConflictError extends Error {}
  return {
    PublicationConflictError,
    createSupabaseProspectingPostStore: () => ({
      upsert: async () => {
        throw new PublicationConflictError();
      },
    }),
  };
});
vi.mock("@/lib/prospecting/publish-event-post", () => ({ publishEventPost: vi.fn() }));

const { approveEventPostAction } = await import("@/app/admin/prospeccao/actions");

describe("ação de publicação de evento", () => {
  it("conflito de claim retorna erro, nunca sucesso", async () => {
    const form = new FormData();
    form.set("eventId", "11111111-1111-4111-8111-111111111111");

    const result = await approveEventPostAction(null, form);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/andamento/i);
  });
});
