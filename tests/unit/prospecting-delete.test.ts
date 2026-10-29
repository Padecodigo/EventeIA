import { describe, expect, it } from "vitest";

import { deleteMedia } from "@/lib/meta/publishing";
import {
  isEventProspectingDone,
  ORPHAN_POST_TTL_MS,
  shouldDeletePost,
} from "@/lib/prospecting/delete-policy";

describe("deleteMedia (Meta Graph API)", () => {
  const meta = { igUserId: "1784", accessToken: "tok" };

  it("envia DELETE para /{mediaId} com Bearer", async () => {
    let method = "";
    let url = "";
    let auth = "";
    const fetchImpl = (async (u: string, init?: RequestInit) => {
      url = u;
      method = init?.method ?? "";
      auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await deleteMedia({ ...meta, mediaId: "media-9", fetchImpl });

    expect(result).toEqual({ ok: true, id: "media-9" });
    expect(method).toBe("DELETE");
    expect(url).toBe("https://graph.facebook.com/v26.0/media-9");
    expect(auth).toBe("Bearer tok");
  });

  it("devolve erro no HTTP não-2xx", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "mídia não encontrada" } }), { status: 400 })) as unknown as typeof fetch;

    const result = await deleteMedia({ ...meta, mediaId: "x", fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("não encontrada");
  });
});

describe("política de exclusão de posts de isca", () => {
  it("evento concluído/cancelado encerra a prospecção", () => {
    expect(isEventProspectingDone("completed")).toBe(true);
    expect(isEventProspectingDone("canceled")).toBe(true);
    expect(isEventProspectingDone("active")).toBe(false);
    expect(isEventProspectingDone(null)).toBe(false);
  });

  it("deleta post de evento quando a prospecção terminou", () => {
    expect(
      shouldDeletePost({ eventStatus: "completed", createdAt: new Date("2026-10-01"), now: new Date("2026-10-29") }),
    ).toBe(true);
    expect(
      shouldDeletePost({ eventStatus: "active", createdAt: new Date("2026-10-01"), now: new Date("2026-10-29") }),
    ).toBe(false);
  });

  it("post sem evento só é deletado após o TTL", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    const old = new Date(now.getTime() - ORPHAN_POST_TTL_MS - 1);
    const fresh = new Date(now.getTime() - 60_000);
    expect(shouldDeletePost({ eventStatus: null, createdAt: old, now })).toBe(true);
    expect(shouldDeletePost({ eventStatus: null, createdAt: fresh, now })).toBe(false);
  });
});
