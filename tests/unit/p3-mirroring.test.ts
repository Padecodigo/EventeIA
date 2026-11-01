import { describe, expect, it, vi } from "vitest";

import { handleMetaWebhookJob, type MetaWebhookJobDeps } from "@/lib/jobs/meta-webhook";
import { parseMetaEchoes, parseMetaWebhook } from "@/lib/meta/webhook";
import { sendChatMessage, type ChatDb } from "@/lib/outreach/chat";
import { isOwnAppEcho } from "@/lib/outreach/echo";
import { mirrorOutboundMessage, type SupplierConversationStore } from "@/lib/outreach/supplier-conversations";
import { createSupabaseRespondPorts, type RespondDb } from "@/lib/prospecting/supabase-respond";

const OWN_APP = "2618353308635056";

function store(found = true) {
  const inserted: Record<string, unknown>[] = [];
  const s: SupplierConversationStore = {
    find: async (channel, externalUserId) =>
      found
        ? { id: "sc1", channel, externalUserId, eventId: "ev1", supplierId: null, ref: null, lastInboundAt: null, windowExpiresAt: null, windowKind: "standard_24h", status: "open" }
        : null,
    upsert: async () => {
      throw new Error("espelhamento não deve criar conversa");
    },
    insertMessage: async (input) => {
      inserted.push(input);
      return true;
    },
  };
  return { s, inserted };
}

const echoPayload = (message: Record<string, unknown>, object = "instagram") => ({
  object,
  entry: [{ id: "1784", messaging: [{ sender: { id: "1784" }, recipient: { id: "sup-1" }, message: { mid: "mid-e1", text: "Oi! Confirmo amanhã.", is_echo: true, ...message } }] }],
});

describe("parseMetaEchoes", () => {
  it("lê ecos de IG e Messenger com destinatário e app_id", () => {
    expect(parseMetaEchoes(echoPayload({ app_id: 123 }))).toEqual([
      { source: "instagram", eventId: "mid-e1", recipientId: "sup-1", text: "Oi! Confirmo amanhã.", appId: "123" },
    ]);
    expect(parseMetaEchoes(echoPayload({}, "page"))[0]).toMatchObject({ source: "messenger", appId: null });
  });
  it("regressão: eco continua fora do parse de inbound (agente nunca responde a si mesmo)", () => {
    expect(parseMetaWebhook(echoPayload({}))).toEqual([]);
    expect(parseMetaEchoes({ object: "instagram", entry: [{ messaging: [{ sender: { id: "a" }, recipient: { id: "b" }, message: { mid: "x", text: "oi" } }] }] })).toEqual([]);
  });
  it("isOwnAppEcho só descarta o nosso app", () => {
    expect(isOwnAppEcho(OWN_APP, OWN_APP)).toBe(true);
    expect(isOwnAppEcho(null, OWN_APP)).toBe(false);
    expect(isOwnAppEcho("999", OWN_APP)).toBe(false);
  });
});

describe("mirrorOutboundMessage", () => {
  it("grava saída do agente moderada, sem enviar e sem criar conversa", async () => {
    const { s, inserted } = store();
    expect(await mirrorOutboundMessage(s, { channel: "instagram", externalUserId: "sup-1", body: "me chama no 11 99999-8888", externalId: "m1", author: "agent" })).toBe(true);
    expect(inserted[0]).toMatchObject({ conversationId: "sc1", direction: "out", author: "agent", externalId: "m1", moderated: true });
    expect(String(inserted[0]?.body)).not.toContain("99999");
  });
  it("sem conversa canônica não grava", async () => {
    const { s, inserted } = store(false);
    expect(await mirrorOutboundMessage(s, { channel: "instagram", externalUserId: "x", body: "oi", externalId: null, author: "agent" })).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("job meta-webhook — eco", () => {
  function deps(s: SupplierConversationStore) {
    const enqueueReply = vi.fn(async () => true);
    const sendReply = vi.fn();
    const inbound = vi.fn();
    const d = {
      env: { keyword: "cotação", accessToken: "tok", igBusinessId: "ig", pageId: "pg", appId: OWN_APP },
      webhookEvents: {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }),
      },
      supplierConversations: s,
      enqueueReply,
      sendReply,
      inbound,
      now: () => new Date("2026-11-01T12:00:00Z"),
    } as unknown as MetaWebhookJobDeps;
    return { d, enqueueReply, sendReply, inbound };
  }

  it("eco humano (caixa da Meta) espelha no chat e não aciona agente nem envio", async () => {
    const { s, inserted } = store();
    const { d, enqueueReply, sendReply, inbound } = deps(s);
    await handleMetaWebhookJob({ kind: "echo", webhookEventId: "w1", event: { source: "instagram", eventId: "mid-e1", recipientId: "sup-1", text: "Oi", appId: null } }, d);
    expect(inserted).toHaveLength(1);
    expect(enqueueReply).not.toHaveBeenCalled();
    expect(sendReply).not.toHaveBeenCalled();
    expect(inbound).not.toHaveBeenCalled();
  });
  it("eco do próprio app é ignorado (já gravado por quem enviou)", async () => {
    const { s, inserted } = store();
    const { d } = deps(s);
    await handleMetaWebhookJob({ kind: "echo", webhookEventId: "w1", event: { source: "instagram", eventId: "mid-e2", recipientId: "sup-1", text: "Oi", appId: OWN_APP } }, d);
    expect(inserted).toHaveLength(0);
  });
});

describe("agente → chat do evento", () => {
  const db = {
    from: () => ({ insert: async () => ({ error: null }) }),
  } as unknown as RespondDb;
  const message = { channel: "instagram" as const, instagramBusinessId: "1784", accessToken: "tok" };

  it("resposta enviada é espelhada com o mid", async () => {
    const mirror = vi.fn(async () => undefined);
    const ok = await createSupabaseRespondPorts({ db, message, recipientId: "sup-1", notify: async () => undefined, send: async () => ({ ok: true as const, messageId: "m9" }), mirror }).sendReply("c1", "Olá!");
    expect(ok).toBe(true);
    expect(mirror).toHaveBeenCalledWith("Olá!", "m9");
  });
  it("regressão: falha no envio não espelha; falha no espelho não desfaz o envio", async () => {
    const mirror = vi.fn(async () => undefined);
    await createSupabaseRespondPorts({ db, message, recipientId: "sup-1", notify: async () => undefined, send: async () => ({ ok: false as const, status: 500 }) as never, mirror }).sendReply("c1", "x");
    expect(mirror).not.toHaveBeenCalled();
    const ok = await createSupabaseRespondPorts({ db, message, recipientId: "sup-1", notify: async () => undefined, send: async () => ({ ok: true as const, messageId: "m" }), mirror: async () => { throw new Error("db"); } }).sendReply("c1", "x");
    expect(ok).toBe(true);
  });
});

describe("chat do site → fornecedor", () => {
  it("regressão: eco que chegou antes (23505) não vira erro para o usuário", async () => {
    const conversation = { id: "sc1", event_id: "ev1", supplier_id: null, channel: "instagram" as const, external_user_id: "sup-1", status: "open" as const, window_expires_at: "2026-11-02T12:00:00Z" };
    const db = {
      from: (table: string) =>
        table === "supplier_conversations"
          ? {
              select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: conversation, error: null }) }) }) }),
              update: () => ({ eq: async () => ({ error: null }) }),
            }
          : { insert: async () => ({ error: { code: "23505" } }) },
    } as unknown as ChatDb;
    const result = await sendChatMessage(db, { eventId: "ev1", conversationId: "sc1", body: "Oi", author: "user" }, { now: new Date("2026-11-02T11:00:00Z"), send: async () => ({ ok: true, messageId: "m1" }) });
    expect(result).toEqual({ ok: true, messageId: "m1", masked: false });
  });
});
