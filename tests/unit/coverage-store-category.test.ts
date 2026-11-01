import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { createCoveragePorts } from "@/lib/prospecting/coverage-store";

function fakeDb() {
  const upserts: Record<string, unknown>[][] = [];
  const db = {
    from: () => ({
      upsert: async (values: Record<string, unknown>[]) => {
        upserts.push(values);
        return { error: null };
      },
    }),
  };
  return { db: db as never, upserts };
}

const row = { itemCode: "garcons", coverage: "included", extraPriceCents: null, quantityCovered: null, evidence: null, source: "ai_extracted", confidence: 0.9, roundsAsked: 1, askedAt: null, answeredAt: null } as const;

describe("createCoveragePorts — categoria (0079)", () => {
  it("grava a categoria da cotação", async () => {
    const { db, upserts } = fakeDb();
    await createCoveragePorts({ client: {} as never, db, category: "buffet" }).save("q1", "c1", [row]);
    expect(upserts[0]?.[0]?.category).toBe("buffet");
  });
  it("regressão: categoria fora do padrão (ex.: texto livre) vira null, não viola o check", async () => {
    const { db, upserts } = fakeDb();
    await createCoveragePorts({ client: {} as never, db, category: "Buffet Completo!" }).save("q1", "c1", [row]);
    expect(upserts[0]?.[0]?.category).toBeNull();
  });
});
