import { describe, expect, it } from "vitest";

import { normalizeNeeds, planNeedPosts } from "@/lib/prospecting/plan-needs";

const suppliers = [
  { handle: "buffet_a", category: "buffet" },
  { handle: "buffet_b", category: "buffet" },
  { handle: "buffet_c", category: "buffet" },
  { handle: "buffet_d", category: "buffet" },
  { handle: "buffet_e", category: "buffet" },
  { handle: "foto_a", category: "fotografia" },
];

describe("necessidade → N posts", () => {
  it("duplica a postagem até marcar todos da categoria", () => {
    const posts = planNeedPosts(["buffet"], suppliers, { maxTagsPerPost: 2, maxPostsPerDay: 10 });
    expect(posts).toHaveLength(3);
    expect(posts.map((p) => `${p.part}/${p.totalParts}`)).toEqual(["1/3", "2/3", "3/3"]);
    const marcados = posts.flatMap((p) => p.handles);
    expect(marcados.sort()).toEqual(["buffet_a", "buffet_b", "buffet_c", "buffet_d", "buffet_e"]);
  });

  it("cada post não excede o limite de marcações", () => {
    const posts = planNeedPosts(["buffet", "fotografia"], suppliers, { maxTagsPerPost: 2, maxPostsPerDay: 10 });
    for (const post of posts) expect(post.handles.length).toBeLessThanOrEqual(2);
  });

  it("respeita a ordem das necessidades e ignora necessidade sem fornecedor", () => {
    const posts = planNeedPosts(["fotografia", "buffet", "sem-ninguem"], suppliers, {
      maxTagsPerPost: 5,
      maxPostsPerDay: 10,
    });
    expect(posts.map((p) => p.category)).toEqual(["fotografia", "buffet"]);
  });

  it("espaça no máximo maxPostsPerDay por dia", () => {
    const posts = planNeedPosts(["buffet", "fotografia"], suppliers, { maxTagsPerPost: 1, maxPostsPerDay: 2 });
    const byDay = new Map<number, number>();
    for (const p of posts) byDay.set(p.dayIndex, (byDay.get(p.dayIndex) ?? 0) + 1);
    expect([...byDay.values()].every((n) => n <= 2)).toBe(true);
    expect(posts[0]?.dayIndex).toBe(0);
    expect(posts[2]?.dayIndex).toBe(1);
  });

  it("rejeita limites inválidos", () => {
    expect(() => planNeedPosts(["buffet"], suppliers, { maxTagsPerPost: 0, maxPostsPerDay: 1 })).toThrow();
    expect(() => planNeedPosts(["buffet"], suppliers, { maxTagsPerPost: 1, maxPostsPerDay: 0 })).toThrow();
  });

  it("normaliza necessidades (trim, vazio, duplicata)", () => {
    expect(normalizeNeeds([" buffet ", "buffet", "", "  ", "fotografia"])).toEqual(["buffet", "fotografia"]);
  });
});
