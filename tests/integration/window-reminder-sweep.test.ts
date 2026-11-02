import { describe, expect, it, vi } from "vitest";

import { sendInstagramText } from "@/lib/meta/client";
import {
  runWindowReminderSweep,
  type ReminderCandidate,
  type ReminderPorts,
} from "@/lib/outreach/window-reminder";

/** Banco em memória + envio real do client Meta contra um fetch falso (nada sai). */
function harness(candidates: ReminderCandidate[], opts: { failSend?: boolean } = {}) {
  const sentForWindow = new Map<string, string | null>(candidates.map((c) => [c.conversationId, c.reminderSentForWindow]));
  const outbound: { conversationId: string; text: string }[] = [];
  const fetchImpl = vi.fn(async () =>
    opts.failSend
      ? new Response(JSON.stringify({ error: { message: "x" } }), { status: 400 })
      : new Response(JSON.stringify({ message_id: "mid-1" }), { status: 200 }),
  ) as unknown as typeof fetch;
  const ports: ReminderPorts = {
    listCandidates: async () =>
      candidates.map((c) => ({ ...c, reminderSentForWindow: sentForWindow.get(c.conversationId) ?? null })),
    claim: async (id, key) => {
      if (sentForWindow.get(id) === key) return false;
      sentForWindow.set(id, key);
      return true;
    },
    release: async (id, key) => {
      if (sentForWindow.get(id) === key) sentForWindow.set(id, null);
    },
    send: async (c, text) => {
      const r = await sendInstagramText({ instagramBusinessId: "ig", accessToken: "t", recipientId: c.externalUserId, text, fetchImpl });
      return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, messageId: null };
    },
    recordOutbound: async (conversationId, text) => {
      outbound.push({ conversationId, text });
    },
  };
  return { ports, fetchImpl, outbound, sentForWindow };
}

const c: ReminderCandidate = {
  conversationId: "c1",
  channel: "instagram",
  externalUserId: "igsid-test",
  status: "awaiting_supplier",
  supplierOptedOut: false,
  lastInbound: { id: "m-in-1", at: "2026-11-03T22:00:00Z", body: "Oi" },
  lastOutboundAt: "2026-11-03T22:05:00Z",
  hasPrice: false,
  reminderSentForWindow: null,
  introducedBefore: true,
};
const near = new Date("2026-11-04T19:00:00Z");

describe("sweep de lembrete da janela 24h", () => {
  it("envia perto do fechamento e grava a saída", async () => {
    const h = harness([c]);
    expect((await runWindowReminderSweep(h.ports, near)).sent).toBe(1);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.outbound).toHaveLength(1);
    expect(h.sentForWindow.get("c1")).toBe("m-in-1");
  });
  it("idempotente: segunda rodada na mesma janela não reenvia", async () => {
    const h = harness([c]);
    await runWindowReminderSweep(h.ports, near);
    const again = await runWindowReminderSweep(h.ports, new Date(near.getTime() + 15 * 60_000));
    expect(again.sent).toBe(0);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("não envia se o fornecedor respondeu", async () => {
    const h = harness([{ ...c, lastOutboundAt: "2026-11-03T21:00:00Z" }]);
    expect((await runWindowReminderSweep(h.ports, near)).sent).toBe(0);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it("não envia em opt-out", async () => {
    const h = harness([{ ...c, status: "opted_out" }]);
    expect((await runWindowReminderSweep(h.ports, near)).sent).toBe(0);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it("não envia fora do horário comercial (nem consulta candidatos)", async () => {
    const h = harness([c]);
    const spy = vi.spyOn(h.ports, "listCandidates");
    expect((await runWindowReminderSweep(h.ports, new Date("2026-11-04T22:00:00Z"))).sent).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
  it("não envia após a janela fechar", async () => {
    const h = harness([c]);
    expect((await runWindowReminderSweep(h.ports, new Date("2026-11-05T13:00:00Z"))).sent).toBe(0);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it("falha no envio libera o claim para nova tentativa", async () => {
    const h = harness([c], { failSend: true });
    const r = await runWindowReminderSweep(h.ports, near);
    expect(r.sent).toBe(0);
    expect(r.skipped.send_failed).toBe(1);
    expect(h.sentForWindow.get("c1")).toBeNull();
  });
});
