import { describe, expect, it } from "vitest";

import { artForEventType, storyArtForEventType } from "@/lib/prospecting/photos";

describe("artes de story (9:16) com a marca", () => {
  it("story aponta para /brand/stories e post para /brand/posts", () => {
    expect(artForEventType("festa infantil")).toBe("/brand/posts/infantil.jpg");
    expect(storyArtForEventType("festa infantil")).toBe("/brand/stories/infantil.jpg");
    expect(storyArtForEventType("casamento")).toBe("/brand/stories/casamento.jpg");
    expect(storyArtForEventType("tipo desconhecido")).toBe("/brand/stories/infantil.jpg");
  });
});
