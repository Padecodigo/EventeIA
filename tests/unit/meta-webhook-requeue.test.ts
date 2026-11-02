/* eslint-disable @typescript-eslint/require-await -- fakes em memória implementam a interface assíncrona */
import { describe, expect, it } from "vitest";

import { kindOfPayload, metaJobId, requeueStaleMetaWebhooks, type StaleMetaEventRow } from "@/lib/jobs/meta-webhook-requeue";

const NOW = new Date("2026-11-02T12:00:00Z");

function deps(rows: StaleMetaEventRow[]) {
  const calls: { olderThan: string; newerThan: string; limit: number }[] = [];
  const enqueued: { jobId: string; kind: string; webhookEventId: string }[] = [];
  return {
    calls,
    enqueued,
    d: {
      now: () => NOW,
      listStale: async (olderThan: string, newerThan: string, limit: number) => {
        calls.push({ olderThan, newerThan, limit });
        return rows;
      },
      enqueue: async (jobId: string, data: { kind: string; webhookEventId: string }) => {
        enqueued.push({ jobId, kind: data.kind, webhookEventId: data.webhookEventId });
      },
    },
  };
}

describe("kindOfPayload", () => {
  it("reconhece mensagem, comentário e eco", () => {
    expect(kindOfPayload({ eventId: "m1", senderId: "s", recipientId: "r", text: "oi", source: "instagram" })).toBe("message");
    expect(kindOfPayload({ commentId: "c1", text: "x", senderId: "s", senderUsername: "u", mediaId: null })).toBe("comment");
    expect(kindOfPayload({ eventId: "e1", recipientId: "r", text: "x", appId: null, source: "instagram" })).toBe("echo");
  });
  it("rejeita payload desconhecido", () => {
    expect(kindOfPayload(null)).toBeNull();
    expect(kindOfPayload({ object: "instagram" })).toBeNull();
  });
});

describe("requeueStaleMetaWebhooks", () => {
  it("usa janela 5min..48h e o mesmo jobId da rota", async () => {
    const t = deps([{ id: "w1", external_event_id: "ig:mid.1", payload: { eventId: "ig:mid.1", senderId: "s", recipientId: "r", text: "oi", source: "instagram" } }]);
    const result = await requeueStaleMetaWebhooks(t.d);
    expect(result).toEqual({ requeued: 1, skipped: 0 });
    expect(t.calls[0]).toEqual({ olderThan: "2026-11-02T11:55:00.000Z", newerThan: "2026-10-31T12:00:00.000Z", limit: 200 });
    expect(t.enqueued).toEqual([{ jobId: "meta_ig_mid.1", kind: "message", webhookEventId: "w1" }]);
    expect(metaJobId("a:b:c")).toBe("meta_a_b_c");
  });
  it("pula payload irreconhecível sem enfileirar", async () => {
    const t = deps([{ id: "w2", external_event_id: "x", payload: { foo: 1 } }]);
    expect(await requeueStaleMetaWebhooks(t.d)).toEqual({ requeued: 0, skipped: 1 });
    expect(t.enqueued).toHaveLength(0);
  });
});
