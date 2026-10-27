import { describe, expect, it } from "vitest";

import { CAPTION, USER_TAGS_MAX } from "@/lib/meta/limits";
import {
  createMediaContainer,
  limitUserTags,
  publishContainer,
  sendPrivateReply,
  validateCaption,
} from "@/lib/meta/publishing";

const base = { igUserId: "1784", accessToken: "tok" };

function captureFetch(id = "c1"): { fetchImpl: typeof fetch; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
    return Promise.resolve(
      new Response(JSON.stringify({ id }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("legenda", () => {
  it("aceita legenda dentro dos limites", () => {
    expect(validateCaption("Venha conhecer! #buffet #festa")).toEqual({ ok: true });
  });

  it("rejeita legenda longa demais, hashtags e menções em excesso", () => {
    expect(validateCaption("x".repeat(CAPTION.maxChars + 1)).ok).toBe(false);
    expect(validateCaption(Array.from({ length: CAPTION.maxHashtags + 1 }, (_, i) => `#h${String(i)}`).join(" ")).ok).toBe(false);
    expect(validateCaption(Array.from({ length: CAPTION.maxMentions + 1 }, (_, i) => `@u${String(i)}`).join(" ")).ok).toBe(false);
  });

  it("limita user tags ao teto adotado", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `fornecedor${String(i)}`);
    expect(limitUserTags(tags)).toHaveLength(USER_TAGS_MAX);
  });
});

describe("container e publicação", () => {
  it("cria o container com imagem, legenda e user_tags no endpoint correto", async () => {
    const { fetchImpl, calls } = captureFetch("container-1");
    const result = await createMediaContainer({
      ...base,
      imageUrl: "https://cdn/x.jpg",
      caption: "Comente COTAÇÃO",
      userTags: ["buffet_a", "buffet_b"],
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, id: "container-1" });
    expect(calls[0]?.url).toContain("https://graph.facebook.com/v26.0/1784/media?");
    expect(calls[0]?.url).toContain("image_url=https%3A%2F%2Fcdn%2Fx.jpg");
    expect(calls[0]?.url).toContain("user_tags=");
  });

  it("recusa publicar legenda fora dos limites sem chamar a API", async () => {
    const { fetchImpl, calls } = captureFetch();
    const result = await createMediaContainer({
      ...base,
      imageUrl: "https://cdn/x.jpg",
      caption: "x".repeat(CAPTION.maxChars + 1),
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("publica o container pelo creation_id", async () => {
    const { fetchImpl, calls } = captureFetch("media-9");
    const result = await publishContainer({ ...base, creationId: "container-1", fetchImpl });
    expect(result).toEqual({ ok: true, id: "media-9" });
    expect(calls[0]?.url).toContain("media_publish?creation_id=container-1");
  });
});

describe("private reply", () => {
  it("envia recipient.comment_id no endpoint de mensagens", async () => {
    const { fetchImpl, calls } = captureFetch("msg-1");
    const result = await sendPrivateReply({ ...base, commentId: "c9", text: "Olá!", fetchImpl });
    expect(result).toEqual({ ok: true, id: "msg-1" });
    expect(calls[0]?.body).toEqual({ recipient: { comment_id: "c9" }, message: { text: "Olá!" } });
  });
});
