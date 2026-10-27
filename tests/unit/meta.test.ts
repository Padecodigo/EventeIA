import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sendInstagramText, sendMessengerText } from "@/lib/meta/client";
import { verifyChallenge, verifyHubSignature } from "@/lib/meta/signature";
import { parseMetaWebhook } from "@/lib/meta/webhook";

const SECRET = "app-secret-123";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body, "utf8").digest("hex")}`;
}

describe("meta — assinatura e desafio", () => {
  it("aceita assinatura válida e rejeita corpo adulterado", () => {
    const body = '{"object":"instagram"}';
    expect(verifyHubSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyHubSignature(body + "x", sign(body), SECRET)).toBe(false);
  });

  it("rejeita header malformado, ausente ou segredo vazio", () => {
    expect(verifyHubSignature("x", "sha256=abc", SECRET)).toBe(false);
    expect(verifyHubSignature("x", null, SECRET)).toBe(false);
    expect(verifyHubSignature("x", sign("x"), undefined)).toBe(false);
  });

  it("desafio GET devolve o challenge só com o verify_token certo", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "12345",
    });
    expect(verifyChallenge(params, "tok")).toBe("12345");
    expect(verifyChallenge(params, "errado")).toBeNull();
  });
});

describe("meta — parse do webhook", () => {
  it("normaliza mensagem do Instagram", () => {
    const messages = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "1784",
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "111" },
                recipient: { id: "1784" },
                message: { mid: "m1", text: "tem buffet para 100?" },
              },
            },
          ],
        },
      ],
    });
    expect(messages).toEqual([
      { source: "instagram", eventId: "m1", senderId: "111", recipientId: "1784", text: "tem buffet para 100?" },
    ]);
  });

  it("normaliza mensagem do Messenger", () => {
    const messages = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "1393",
          messaging: [
            {
              sender: { id: "222" },
              recipient: { id: "1393" },
              message: { mid: "m2", text: "quanto custa?" },
            },
          ],
        },
      ],
    });
    expect(messages).toEqual([
      { source: "messenger", eventId: "m2", senderId: "222", recipientId: "1393", text: "quanto custa?" },
    ]);
  });

  it("ignora payload não reconhecido", () => {
    expect(parseMetaWebhook({ object: "instagram", entry: [] })).toEqual([]);
    expect(parseMetaWebhook({ object: "page", entry: [{ messaging: [] }] })).toEqual([]);
    expect(parseMetaWebhook({ foo: 1 })).toBeNull();
  });
});

describe("meta — cliente de envio", () => {
  function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
    return Promise.resolve(
      new Response(JSON.stringify({ message_id: "m_ok" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as Promise<Response>;
  }

  it("Instagram: POST no endpoint correto com Bearer e body", async () => {
    const calls: { url: RequestInfo | URL; init?: RequestInit }[] = [];
    const res = await sendInstagramText({
      accessToken: "tok",
      instagramBusinessId: "1784",
      recipientId: "111",
      text: "olá",
      fetchImpl: ((u, i) => {
        calls.push({ url: u, init: i });
        return fakeFetch(u, i);
      }) as typeof fetch,
    });
    expect(res).toEqual({ ok: true, messageId: "m_ok" });
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v21.0/1784/messages");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      recipient: { id: "111" },
      message: { text: "olá" },
    });
  });

  it("Messenger: inclui messaging_type RESPONSE", async () => {
    const calls: { init?: RequestInit }[] = [];
    await sendMessengerText({
      accessToken: "tok",
      pageId: "1393",
      recipientId: "222",
      text: "olá",
      fetchImpl: ((u, i) => {
        calls.push({ init: i });
        return fakeFetch(u, i);
      }) as typeof fetch,
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      recipient: { id: "222" },
      messaging_type: "RESPONSE",
      message: { text: "olá" },
    });
  });

  it("propaga erro da Graph API", async () => {
    const res = await sendInstagramText({
      accessToken: "tok",
      instagramBusinessId: "1784",
      recipientId: "111",
      text: "olá",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: "permission denied" } }), { status: 403 })) as typeof fetch,
    });
    expect(res).toEqual({ ok: false, error: "permission denied", status: 403 });
  });
});
