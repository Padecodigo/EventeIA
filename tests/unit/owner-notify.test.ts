import { describe, expect, it, vi } from "vitest";

import { createMockEmailAdapter, type EmailMessage } from "@/lib/notifications/email";
import {
  buildSupplierReplyEmail,
  createMemoryThrottle,
  createRedisThrottle,
  notifyOwnerOfSupplierReply,
  type SupplierReplyNotice,
} from "@/lib/outreach/owner-notify";

const notice = (over: Partial<SupplierReplyNotice> = {}): SupplierReplyNotice => ({
  conversationId: "sc1",
  channel: "instagram",
  eventId: "ev-1",
  supplierKnown: true,
  text: "Temos disponibilidade, segue orçamento",
  at: new Date("2026-11-02T13:00:00Z"),
  ...over,
});

function setup(to: string | null = "dono@eventeia.com.br") {
  let clock = 0;
  const sent: EmailMessage[] = [];
  const deps = {
    to,
    throttleMinutes: 30,
    email: createMockEmailAdapter(sent),
    throttle: createMemoryThrottle(() => clock),
    appUrl: "https://eventeia.com.br",
  };
  return { deps, sent, advance: (ms: number) => (clock += ms) };
}

describe("aviso ao dono quando fornecedor responde", () => {
  it("envia e-mail com canal, trecho e link do evento", async () => {
    const { deps, sent } = setup();
    expect(await notifyOwnerOfSupplierReply(deps, notice())).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "dono@eventeia.com.br", subject: "Resposta de fornecedor no Instagram", eventId: "ev-1" });
    expect(sent[0]?.text).toContain("https://eventeia.com.br/admin/eventos/ev-1");
    expect(sent[0]?.text).toContain("Temos disponibilidade");
  });

  it("sem destinatário configurado não envia", async () => {
    const { deps, sent } = setup(null);
    expect(await notifyOwnerOfSupplierReply(deps, notice())).toEqual({ sent: false, reason: "no_recipient" });
    expect(sent).toHaveLength(0);
  });

  it("anti-spam: rajada na mesma conversa gera 1 e-mail; após a janela, resume as pendentes", async () => {
    const { deps, sent, advance } = setup();
    await notifyOwnerOfSupplierReply(deps, notice());
    await notifyOwnerOfSupplierReply(deps, notice({ text: "2" }));
    await notifyOwnerOfSupplierReply(deps, notice({ text: "3" }));
    expect(sent).toHaveLength(1);
    advance(31 * 60 * 1000);
    await notifyOwnerOfSupplierReply(deps, notice({ text: "4" }));
    expect(sent).toHaveLength(2);
    expect(sent[1]?.text).toContain("Além desta, 2 mensagem(ns)");
  });

  it("conversas diferentes não se bloqueiam", async () => {
    const { deps, sent } = setup();
    await notifyOwnerOfSupplierReply(deps, notice());
    await notifyOwnerOfSupplierReply(deps, notice({ conversationId: "sc2", channel: "messenger", eventId: null }));
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject).toContain("Messenger");
    expect(sent[1]?.text).toContain("sem evento vinculado");
  });

  it("falha no envio não lança", async () => {
    const { deps } = setup();
    const result = await notifyOwnerOfSupplierReply(
      { ...deps, email: { mode: "mock", send: () => Promise.reject(new Error("resend fora")) } },
      notice(),
    );
    expect(result).toEqual({ sent: false, reason: "error" });
  });

  it("trunca mensagens longas", () => {
    const { text } = buildSupplierReplyEmail(notice({ text: "x".repeat(500) }), 0, "https://a");
    expect(text).toContain(`${"x".repeat(300)}…`);
    expect(text).not.toContain("x".repeat(301));
  });

  it("throttle Redis usa SET NX EX e GETDEL", async () => {
    const redis = {
      set: vi.fn(async () => "OK" as string | null),
      incr: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
      getdel: vi.fn(async () => "3" as string | null),
    };
    const t = createRedisThrottle(redis);
    expect(await t.acquire("k", 1800)).toBe(true);
    expect(redis.set).toHaveBeenCalledWith("k", "1", "EX", 1800, "NX");
    redis.set.mockResolvedValueOnce(null);
    expect(await t.acquire("k", 1800)).toBe(false);
    expect(await t.take("p")).toBe(3);
  });
});
