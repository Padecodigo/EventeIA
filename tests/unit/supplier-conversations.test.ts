import { describe, expect, it } from "vitest";

import {
  ingestSupplierMessage,
  markExpiredWindows,
  type SupplierConversationStore,
  type WindowSweepDb,
} from "@/lib/outreach/supplier-conversations";
import { windowExpiresAt } from "@/lib/outreach/window";

const NOW = new Date("2026-10-26T14:00:00Z");
const UUID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("windowExpiresAt", () => {
  it("janela padrão fecha em 24h", () => {
    expect(windowExpiresAt("standard_24h", NOW).getTime()).toBe(
      NOW.getTime() + 24 * 60 * 60 * 1000,
    );
  });

  it("janela de anúncio fecha em 7 dias", () => {
    expect(windowExpiresAt("ad_7d", NOW).getTime()).toBe(
      NOW.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
  });
});

function fakeStore() {
  const upserts: Parameters<SupplierConversationStore["upsert"]>[0][] = [];
  const inserted: Parameters<SupplierConversationStore["insertMessage"]>[0][] = [];
  const store: SupplierConversationStore = {
    async find() {
      return null;
    },
    async upsert(input) {
      upserts.push(input);
      return {
        id: "sc1",
        channel: input.channel,
        externalUserId: input.externalUserId,
        eventId: input.eventId ?? null,
        supplierId: input.supplierId ?? null,
        ref: input.ref ?? null,
        lastInboundAt: input.lastInboundAt.toISOString(),
        windowExpiresAt: input.windowExpiresAt.toISOString(),
        windowKind: input.windowKind,
        status: input.status ?? "open",
      };
    },
    async insertMessage(input) {
      inserted.push(input);
      return true;
    },
  };
  return { store, upserts, inserted };
}

describe("ingestSupplierMessage", () => {
  it("cria a conversa, abre a janela e grava a mensagem", async () => {
    const { store, upserts, inserted } = fakeStore();
    const result = await ingestSupplierMessage(store, {
      channel: "instagram",
      externalUserId: "111",
      ref: `event:${UUID}`,
      windowKind: "ad_7d",
      body: "olá",
      externalId: "mid-1",
      now: NOW,
    });

    expect(result.conversationId).toBe("sc1");
    expect(result.recorded).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      channel: "instagram",
      externalUserId: "111",
      eventId: UUID,
      ref: `event:${UUID}`,
      windowKind: "ad_7d",
    });
    expect(upserts[0]?.windowExpiresAt.toISOString()).toBe(
      windowExpiresAt("ad_7d", NOW).toISOString(),
    );
    expect(inserted).toEqual([
      { conversationId: "sc1", direction: "in", body: "olá", externalId: "mid-1" },
    ]);
  });

  it("ref sem evento não vincula eventId", async () => {
    const { store, upserts } = fakeStore();
    await ingestSupplierMessage(store, {
      channel: "messenger",
      externalUserId: "psid-1",
      ref: "fornecedor",
      windowKind: "standard_24h",
      body: "oi",
      externalId: "mid-2",
      now: NOW,
    });
    expect(upserts[0]?.eventId).toBeNull();
    expect(upserts[0]?.ref).toBe("fornecedor");
  });
});

describe("markExpiredWindows", () => {
  it("retorna o total de conversas marcadas como canal_fechado", async () => {
    const db: WindowSweepDb = {
      from: () => ({
        update: () => ({
          eq: () => ({
            lt: () => ({
              select: async () => ({ data: [{ id: "a" }, { id: "b" }], error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(markExpiredWindows(db, NOW)).resolves.toBe(2);
  });

  it("retorna 0 quando não há conversas vencidas", async () => {
    const db: WindowSweepDb = {
      from: () => ({
        update: () => ({
          eq: () => ({
            lt: () => ({
              select: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(markExpiredWindows(db, NOW)).resolves.toBe(0);
  });
});
