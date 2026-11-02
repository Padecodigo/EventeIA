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

  it("publica o container pelo creation_id (sem espera quando já confirmado)", async () => {
    const { fetchImpl, calls } = captureFetch("media-9");
    const result = await publishContainer({ ...base, creationId: "container-1", fetchImpl, waitForReady: false });
    expect(result).toEqual({ ok: true, id: "media-9" });
    expect(calls[0]?.url).toContain("media_publish?creation_id=container-1");
  });
});

/** Fetch roteado: status do container segue a sequência dada; media_publish devolve id. */
function statusFetch(statuses: (string | null)[]): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = ((url: string) => {
    urls.push(url);
    if (url.includes("fields=status_code")) {
      const code = statuses[Math.min(i, statuses.length - 1)];
      i += 1;
      return Promise.resolve(code === null ? json({ error: { message: "boom" } }, 500) : json({ status_code: code, id: "c" }));
    }
    if (url.includes("media_publish")) {
      // Regressão: a Meta recusa publicar container que não terminou.
      const ready = statuses.slice(0, i).includes("FINISHED");
      return Promise.resolve(
        ready ? json({ id: "media-1" }) : json({ error: { message: "Media ID is not available" } }, 400),
      );
    }
    return Promise.resolve(json({}, 404));
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

describe("espera do container antes do media_publish", () => {
  const noSleep = { sleep: () => Promise.resolve(), intervalMs: 0 };

  it("regressão 'Media ID is not available': espera IN_PROGRESS -> FINISHED antes de publicar", async () => {
    const { fetchImpl, urls } = statusFetch(["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]);
    const result = await publishContainer({ ...base, creationId: "c1", fetchImpl, ...noSleep });
    expect(result).toEqual({ ok: true, id: "media-1" });
    expect(urls.filter((u) => u.includes("status_code"))).toHaveLength(3);
    expect(urls.at(-1)).toContain("media_publish?creation_id=c1");
  });

  it("não publica quando o container dá ERROR", async () => {
    const { fetchImpl, urls } = statusFetch(["ERROR"]);
    const result = await publishContainer({ ...base, creationId: "c1", fetchImpl, ...noSleep });
    expect(result.ok).toBe(false);
    expect(urls.some((u) => u.includes("media_publish"))).toBe(false);
  });

  it("desiste após maxAttempts sem FINISHED e não chama media_publish", async () => {
    const { fetchImpl, urls } = statusFetch(["IN_PROGRESS"]);
    const result = await publishContainer({ ...base, creationId: "c1", fetchImpl, ...noSleep, maxAttempts: 4 });
    expect(result).toMatchObject({ ok: false });
    expect(urls.filter((u) => u.includes("status_code"))).toHaveLength(4);
    expect(urls.some((u) => u.includes("media_publish"))).toBe(false);
  });

  it("tolera falha transitória na leitura do status", async () => {
    const { fetchImpl } = statusFetch([null, "FINISHED"]);
    const result = await publishContainer({ ...base, creationId: "c1", fetchImpl, ...noSleep });
    expect(result).toEqual({ ok: true, id: "media-1" });
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
