import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  owned: true,
  deleteCalls: [] as string[],
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            not: () => ({
              maybeSingle: async () => ({
                data: state.owned ? { id: "ev1" } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/prospecting/delete-publications", () => ({
  deleteEventPublications: async ({ eventId }: { eventId: string }) => {
    state.deleteCalls.push(eventId);
    return { removed: 0, rowsDeleted: 0, pending: 0 };
  },
}));
vi.mock("@/lib/meta/config", () => ({
  metaPublishConfigFromProcessEnv: () => null,
}));

const { cleanupEventHistorySafely } = await import("@/lib/events/social-cleanup");

beforeEach(() => {
  state.owned = true;
  state.deleteCalls.length = 0;
});

describe("limpeza social da exclusão de histórico", () => {
  it("recusa evento que não pertence ao usuário autenticado", async () => {
    state.owned = false;
    await cleanupEventHistorySafely({ profileId: "u1", eventId: "ev1" });
    expect(state.deleteCalls).toEqual([]);
  });

  it("limpa quando o evento foi apagado pelo próprio usuário", async () => {
    await cleanupEventHistorySafely({ profileId: "u1", eventId: "ev1" });
    expect(state.deleteCalls).toEqual(["ev1"]);
  });
});
