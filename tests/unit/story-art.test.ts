import { describe, expect, it } from "vitest";

import { artForEventType, reelArtForEventType, storyArtForEventType } from "@/lib/prospecting/photos";

describe("artes de post/story/reel com a marca", () => {
  it("cada formato aponta para o diretório certo", () => {
    expect(artForEventType("festa infantil")).toBe("/brand/posts/infantil.jpg");
    expect(storyArtForEventType("festa infantil")).toBe("/brand/stories/infantil.jpg");
    expect(reelArtForEventType("festa infantil")).toBe("/brand/reels/infantil.mp4");
    expect(reelArtForEventType("casamento")).toBe("/brand/reels/casamento.mp4");
    expect(reelArtForEventType("tipo desconhecido")).toBe("/brand/reels/infantil.mp4");
  });
});
