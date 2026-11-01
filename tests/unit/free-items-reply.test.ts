import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadFreeItems } from "@/lib/jobs/prospect-reply";

function fakeDb(eventId: string | null, reqs: { item_code: string; label: string }[]) {
  const calls: string[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order"])
      c[m] = (...a: unknown[]) => (calls.push(`${m}:${a.map(String).join(",")}`), c);
    c.limit = () => Promise.resolve(result);
    c.like = (...a: unknown[]) => (
      calls.push(`like:${a.map(String).join(",")}`),
      Promise.resolve(result)
    );
    return c;
  };
  return {
    calls,
    db: {
      from: (t: string) =>
        t === "supplier_conversations"
          ? chain({ data: eventId === null ? [] : [{ event_id: eventId }] })
          : chain({ data: reqs }),
    } as never,
  };
}

const data = {
  conversationId: "c",
  channel: "instagram" as const,
  recipientId: "ig1",
  supplierId: null,
  category: "recreacao",
};

describe("loadFreeItems (DM → evento → itens livres)", () => {
  it("traz só itens livres válidos da categoria", async () => {
    const { db, calls } = fakeDb("e1", [
      { item_code: "livre_magico", label: "mágico" },
      { item_code: "buffet_jantar", label: "Buffet" },
    ]);
    expect(await loadFreeItems(data, db)).toEqual([{ code: "livre_magico", label: "mágico" }]);
    expect(calls).toContain("eq:category,recreacao");
  });
  it("DM sem evento ligado ⇒ nenhum item", async () => {
    const { db } = fakeDb(null, [{ item_code: "livre_magico", label: "mágico" }]);
    expect(await loadFreeItems(data, db)).toEqual([]);
  });
});
