import { describe, expect, it } from "vitest";

import type { RespondDb } from "@/lib/prospecting/supabase-respond";
import { createSupabaseRespondPorts, loadHistory } from "@/lib/prospecting/supabase-respond";

interface FakeDb {
  inserted: Record<string, unknown>[];
  updates: { table: string; values: Record<string, unknown> }[];
}

function fakeDb(rows: { direction: "in" | "out"; body: string }[] = []): RespondDb & FakeDb {
  const inserted: Record<string, unknown>[] = [];
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const db = {
    inserted,
    updates,
    from(table: string) {
      if (table === "prospect_messages") {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows }) }) }) };
      }
      if (table === "prospect_quotes") {
        return {
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
  return db as unknown as RespondDb & FakeDb;
}

describe("histórico da conversa", () => {
  it("mapeia in→user e out→assistant", async () => {
    const history = await loadHistory(
      fakeDb([
        { direction: "in", body: "olá" },
        { direction: "out", body: "como posso ajudar?" },
      ]),
      "c1",
    );
    expect(history).toEqual([
      { role: "user", content: "olá" },
      { role: "assistant", content: "como posso ajudar?" },
    ]);
  });
});

describe("portas de resposta", () => {
  const deps = () => ({
    db: fakeDb(),
    message: { channel: "instagram" as const, instagramBusinessId: "1784", accessToken: "tok" },
    recipientId: "u1",
  });

  it("salva a cotação com valores em centavos", async () => {
    const d = deps();
    const ports = createSupabaseRespondPorts(d);
    await ports.saveQuote("c1", "s1", {
      product: "buffet",
      specifications: null,
      volume: 100,
      moq: null,
      priceCents: 250000,
      deadlineDays: 10,
      shippingCents: 0,
      paymentTerms: null,
      validUntil: null,
    });
    expect(d.db.inserted[0]).toMatchObject({ conversation_id: "c1", price_cents: 250000, status: "draft" });
  });

  it("marca opt-out na conversa e no fornecedor", async () => {
    const d = deps();
    await createSupabaseRespondPorts(d).markOptOut("c1", "s1");
    expect(d.db.updates.some((u) => u.table === "prospect_conversations" && u.values.status === "opted_out")).toBe(true);
    expect(d.db.updates.some((u) => u.table === "suppliers")).toBe(true);
  });

  it("escala para awaiting_human", async () => {
    const d = deps();
    await createSupabaseRespondPorts(d).escalate("c1", "fora");
    expect(d.db.updates.some((u) => u.values.status === "awaiting_human")).toBe(true);
  });
});
