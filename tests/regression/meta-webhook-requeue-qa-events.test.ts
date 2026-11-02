/* eslint-disable @typescript-eslint/require-await -- fakes em memória implementam a interface assíncrona */
import { describe, expect, it } from "vitest";

import { requeueStaleMetaWebhooks } from "@/lib/jobs/meta-webhook-requeue";

/**
 * Regressão (2026-11-02): eventos meta ficaram `received` para sempre depois que
 * o Redis foi recriado num redeploy. Os 3 eventos simulados de QA (28/10,
 * `qa-ig-*`) NÃO podem ser reprocessados automaticamente — passam de 48h.
 */
describe("regressão: eventos meta presos", () => {
  it("não reprocessa eventos de QA de 28/10 ao rodar em 02/11", async () => {
    const enqueued: string[] = [];
    let window: [string, string] = ["", ""];
    await requeueStaleMetaWebhooks({
      now: () => new Date("2026-11-02T12:00:00Z"),
      listStale: async (olderThan, newerThan) => {
        window = [olderThan, newerThan];
        const qaReceivedAt = "2026-10-28T20:06:55Z";
        return qaReceivedAt > newerThan ? [{ id: "qa", external_event_id: "qa-ig-0", payload: { eventId: "qa-ig-0", senderId: "qa-ig-0", recipientId: "r", text: "COTAÇÃO", source: "instagram" } }] : [];
      },
      enqueue: async (jobId) => { enqueued.push(jobId); },
    });
    expect(window[1] > "2026-10-28T20:06:55Z").toBe(true);
    expect(enqueued).toEqual([]);
  });
});
