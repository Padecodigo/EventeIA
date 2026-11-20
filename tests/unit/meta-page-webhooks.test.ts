import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSubscribedFields,
  subscribePageFields,
  summarizeWebhookPayload,
} from "@/lib/meta/page-webhooks";

type FetchImpl = typeof fetch;

function makeFetch(body: unknown, status = 200): FetchImpl {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as FetchImpl;
}

const baseGetArgs = {
  pageId: "123",
  appId: "1",
  accessToken: "tok",
  apiVersion: "v26.0",
};

const baseSubArgs = {
  pageId: "123",
  fields: ["messages", "feed"],
  accessToken: "tok",
  apiVersion: "v26.0",
};

describe("getSubscribedFields", () => {
  it("devolve os campos do entry cujo id é o appId", async () => {
    const fetchImpl = makeFetch({
      data: [
        { id: "999", subscribed_fields: ["bogus"] },
        { id: "1", subscribed_fields: ["messages", "feed"] },
      ],
    });
    const result = await getSubscribedFields({ ...baseGetArgs, fetchImpl });
    expect(result).toEqual({ ok: true, data: ["messages", "feed"] });
  });

  it("devolve lista vazia quando o app não está presente", async () => {
    const fetchImpl = makeFetch({ data: [{ id: "42", subscribed_fields: ["feed"] }] });
    const result = await getSubscribedFields({ ...baseGetArgs, fetchImpl });
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("envia Authorization Bearer e a URL não contém o token", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await getSubscribedFields({ ...baseGetArgs, fetchImpl: spy as unknown as FetchImpl });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("tok");
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });
});

describe("subscribePageFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia POST para /v26.0/123/subscribed_apps com subscribed_fields", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const result = await subscribePageFields({
      pageId: "123",
      fields: ["messages", "feed"],
      accessToken: "tok",
      apiVersion: "v26.0",
      fetchImpl: spy as unknown as FetchImpl,
    });
    expect(result).toEqual({ ok: true, data: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v26.0/123/subscribed_apps");
    expect(url).not.toContain("tok");
    expect(init.method).toBe("POST");
    const decoded = decodeURIComponent(String(init.body));
    expect(decoded).toContain("subscribed_fields=messages,feed");
  });

  it("filtra campos desconhecidos", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    await subscribePageFields({
      pageId: "123",
      fields: ["messages", "bogus", "feed"],
      accessToken: "tok",
      apiVersion: "v26.0",
      fetchImpl: spy as unknown as FetchImpl,
    });
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const decoded = decodeURIComponent(String(init.body));
    expect(decoded).toContain("subscribed_fields=messages,feed");
    expect(decoded).not.toContain("bogus");
  });

  it("devolve erro 'nenhum campo' quando não há campo válido", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const result = await subscribePageFields({
      ...baseSubArgs,
      fields: ["bogus"],
      fetchImpl: spy as unknown as FetchImpl,
    });
    expect(result).toEqual({ ok: false, error: "nenhum campo", status: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it("devolve erro 'id inválido' para page id não numérico", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const result = await subscribePageFields({
      ...baseSubArgs,
      pageId: "abc",
      fetchImpl: spy as unknown as FetchImpl,
    });
    expect(result).toEqual({ ok: false, error: "id inválido", status: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it("propaga erro da Graph API 403", async () => {
    const fetchImpl = makeFetch(
      { error: { message: "(#200) Permissions error" } },
      403,
    );
    const result = await subscribePageFields({ ...baseSubArgs, fetchImpl });
    expect(result).toEqual({
      ok: false,
      error: "(#200) Permissions error",
      status: 403,
    });
  });
});

describe("summarizeWebhookPayload", () => {
  it("classifica comentário com canal instagram", () => {
    const result = summarizeWebhookPayload({
      commentId: "c1",
      text: "olá",
      senderId: "s1",
      senderUsername: "user",
      mediaId: "m1",
    });
    expect(result).toEqual({ kind: "comentario", channel: "instagram", text: "olá" });
  });

  it("classifica mensagem com canal messenger", () => {
    const result = summarizeWebhookPayload({
      source: "messenger",
      eventId: "e1",
      senderId: "s1",
      recipientId: "r1",
      text: "oi",
    });
    expect(result).toEqual({ kind: "mensagem", channel: "messenger", text: "oi" });
  });

  it("classifica eco", () => {
    const result = summarizeWebhookPayload({
      source: "instagram",
      eventId: "e1",
      recipientId: "r1",
      text: "eco",
      appId: "1",
    });
    expect(result).toEqual({ kind: "eco", channel: "instagram", text: "eco" });
  });

  it("classifica entrada nula como outro com texto vazio", () => {
    const result = summarizeWebhookPayload(null);
    expect(result).toEqual({ kind: "outro", channel: null, text: "" });
  });

  it("trunca texto maior que 140 caracteres", () => {
    const longText = "a".repeat(200);
    const result = summarizeWebhookPayload({ commentId: "c1", text: longText });
    expect(result.kind).toBe("comentario");
    expect(result.text.length).toBe(141);
    expect(result.text.endsWith("…")).toBe(true);
  });
});
