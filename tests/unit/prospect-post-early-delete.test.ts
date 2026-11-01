import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allTaggedContacted, shouldDeletePost } from "@/lib/prospecting/delete-policy";
import { normalizeHandles } from "@/lib/prospecting/posts-store";

const now = new Date("2026-11-03T13:00:00Z");

describe("P1: exclusão antecipada do post quando todos os marcados contataram", () => {
  it("regressão: evento ativo + todos contataram → apaga", () => {
    expect(
      shouldDeletePost({ eventStatus: "active", createdAt: now, now, taggedHandles: ["a", "B"], contactedHandles: ["b", "a"] }),
    ).toBe(true);
  });
  it("evento ativo + falta alguém → mantém", () => {
    expect(shouldDeletePost({ eventStatus: "active", createdAt: now, now, taggedHandles: ["a", "b"], contactedHandles: ["a"] })).toBe(false);
  });
  it("sem marcados não dispara exclusão antecipada", () => {
    expect(allTaggedContacted([], ["a"])).toBe(false);
    expect(shouldDeletePost({ eventStatus: "active", createdAt: now, now })).toBe(false);
  });
  it("encerramento continua apagando mesmo com quem não contatou", () => {
    expect(shouldDeletePost({ eventStatus: "completed", createdAt: now, now, taggedHandles: ["a"], contactedHandles: [] })).toBe(true);
  });
  it("normaliza @ marcados para gravação", () => {
    expect(normalizeHandles(["@Buffet_Ana", " buffet_ana ", "", "@@doces"])).toEqual(["buffet_ana", "doces"]);
  });
});
