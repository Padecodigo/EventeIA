import { describe, expect, it } from "vitest";

import type { MetaSendResult } from "@/lib/meta/client";
import type { MetaSendConfig, RespondDb } from "@/lib/prospecting/supabase-respond";
import {
  createSupabaseRespondPorts,
  loadHistory,
  markSupplierOptOut,
} from "@/lib/prospecting/supabase-respond";

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
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                // A consulta real usa `order created_at desc` (mais recente primeiro).
                limit: () => Promise.resolve({ data: rows.slice().reverse() }),
              }),
            }),
          }),
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return Promise.resolve({ error: null });
          },
        };
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

  it("corta o histórico pelo total de caracteres descartando as mais antigas", async () => {
    const rows: { direction: "in" | "out"; body: string }[] = [
      { direction: "in", body: "A".repeat(4000) },
      { direction: "out", body: "B".repeat(4000) },
      { direction: "in", body: "C".repeat(4000) },
    ];
    const history = await loadHistory(fakeDb(rows), "c1");
    const total = history.reduce((sum, m) => sum + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(8000);
    // As mais antigas (A) são descartadas primeiro.
    expect(history.some((m) => m.content.includes("A"))).toBe(false);
  });
});

describe("portas de resposta", () => {
  const deps = (
    send?: (message: MetaSendConfig, recipientId: string, text: string) => Promise<MetaSendResult>,
  ) => ({
    db: fakeDb(),
    message: { channel: "instagram" as const, instagramBusinessId: "1784", accessToken: "tok" },
    recipientId: "u1",
    notify: async () => {},
    ...(send !== undefined ? { send } : {}),
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

  it("envio ok grava a mensagem de saída e devolve true", async () => {
    const d = deps(async () => ({ ok: true as const, messageId: "m_out_1" }));
    const ports = createSupabaseRespondPorts(d);
    const ok = await ports.sendReply("c1", "olá, tudo bem?");
    expect(ok).toBe(true);
    expect(d.db.inserted[0]).toMatchObject({
      conversation_id: "c1",
      direction: "out",
      body: "olá, tudo bem?",
      external_id: "m_out_1",
    });
  });

  it("falha de envio devolve false e NÃO grava mensagem de saída", async () => {
    const d = deps(async () => ({ ok: false as const, error: "permission denied", status: 403 }));
    const ports = createSupabaseRespondPorts(d);
    const ok = await ports.sendReply("c1", "olá");
    expect(ok).toBe(false);
    expect(d.db.inserted).toHaveLength(0);
  });

  it("falha de insert da mensagem de saída não derruba o envio", async () => {
    const db = {
      from(table: string) {
        if (table === "prospect_messages") {
          return {
            select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
            insert: async () => ({ error: { code: "23505" } }),
          };
        }
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    } as unknown as RespondDb;
    const d = {
      db,
      message: { channel: "instagram" as const, instagramBusinessId: "1784", accessToken: "tok" },
      recipientId: "u1",
      notify: async () => {},
      send: async () => ({ ok: true as const, messageId: "m_out_1" }),
    };
    const ok = await createSupabaseRespondPorts(d).sendReply("c1", "olá");
    expect(ok).toBe(true);
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

describe("markSupplierOptOut", () => {
  it("marca a conversa como opted_out e o fornecedor como opt-out", async () => {
    const db = fakeDb();
    await markSupplierOptOut(db, "c1", "s1");
    expect(
      db.updates.some((u) => u.table === "prospect_conversations" && u.values.status === "opted_out"),
    ).toBe(true);
    const supplier = db.updates.find((u) => u.table === "suppliers");
    expect(supplier?.values).toMatchObject({ status: "opt-out" });
    expect(supplier?.values).toHaveProperty("opt_out_at");
  });

  it("sem fornecedor conhecido só marca a conversa", async () => {
    const db = fakeDb();
    await markSupplierOptOut(db, "c1", null);
    expect(
      db.updates.some((u) => u.table === "prospect_conversations" && u.values.status === "opted_out"),
    ).toBe(true);
    expect(db.updates.some((u) => u.table === "suppliers")).toBe(false);
  });
});
