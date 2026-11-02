/* eslint-disable @typescript-eslint/require-await -- fakes em memória implementam a interface assíncrona */
import { describe, expect, it } from "vitest";

import { requeueStaleMetaWebhooks, type StaleMetaEventRow } from "@/lib/jobs/meta-webhook-requeue";

/**
 * Integração com um "banco" e uma "fila" em memória que imitam o filtro do
 * worker (source=meta, status=received, janela de received_at) e a dedup por
 * jobId do BullMQ: evento persistido cujo job sumiu do Redis volta para a fila;
 * rodar o sweep de novo não duplica.
 */
interface Row extends StaleMetaEventRow { source: string; status: string; received_at: string }

function world(rows: Row[]) {
  const queue = new Map<string, unknown>();
  return {
    queue,
    deps: {
      now: () => new Date("2026-11-02T12:00:00Z"),
      listStale: async (olderThan: string, newerThan: string, limit: number) =>
        rows
          .filter((r) => r.source === "meta" && r.status === "received" && r.received_at < olderThan && r.received_at > newerThan)
          .slice(0, limit),
      enqueue: async (jobId: string, data: unknown) => {
        if (!queue.has(jobId)) queue.set(jobId, data);
      },
    },
  };
}

const msg = (id: string) => ({ eventId: id, senderId: "s", recipientId: "r", text: "Olá", source: "instagram" });

describe("sweep de webhooks meta presos", () => {
  it("reenfileira só os elegíveis e é idempotente", async () => {
    const w = world([
      { id: "1", source: "meta", status: "received", received_at: "2026-11-02T10:00:00Z", external_event_id: "m1", payload: msg("m1") },
      { id: "2", source: "meta", status: "processed", received_at: "2026-11-02T10:00:00Z", external_event_id: "m2", payload: msg("m2") },
      { id: "3", source: "meta", status: "received", received_at: "2026-11-02T11:59:00Z", external_event_id: "m3", payload: msg("m3") },
      { id: "4", source: "asaas", status: "received", received_at: "2026-11-02T10:00:00Z", external_event_id: "m4", payload: msg("m4") },
    ]);
    await requeueStaleMetaWebhooks(w.deps);
    await requeueStaleMetaWebhooks(w.deps);
    expect([...w.queue.keys()]).toEqual(["meta_m1"]);
  });
});
