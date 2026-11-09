import { describe, expect, it } from "vitest";

import {
  IMAGE_NEGATIVE,
  nextSceneIndex,
  sceneDirective,
  sceneRecipe,
  sceneStorageKey,
  withNvidiaAvoidance,
} from "@/lib/marketing/scene-rules";

describe("regras de cena", () => {
  it("troca assunto entre índices seguidos e só inclui pessoas a cada 5", () => {
    const first = sceneRecipe(0);
    const second = sceneRecipe(1);
    expect(first.subject).not.toBe(second.subject);
    expect(first.includePeople).toBe(true);
    expect(second.includePeople).toBe(false);
    expect(sceneRecipe(5).includePeople).toBe(true);
    expect(sceneDirective(1)).toContain("No people");
    expect(sceneDirective(0)).toContain("Avoid:");
    expect(sceneDirective(0)).toContain(IMAGE_NEGATIVE);
  });

  it("pula a cena já publicada e afasta a tentativa seguinte", () => {
    const used = new Set([sceneStorageKey("casamento", 0)]);
    expect(nextSceneIndex(0, used, "casamento", 0)).not.toBe(0);
    expect(nextSceneIndex(0, new Set(), "casamento", 0)).not.toBe(
      nextSceneIndex(0, new Set(), "casamento", 1),
    );
  });

  it("grava Avoid no texto quando o provedor não tem campo negativo", () => {
    expect(withNvidiaAvoidance("a still table")).toContain("Avoid:");
    expect(withNvidiaAvoidance("a still table. Avoid: blur.")).toBe("a still table. Avoid: blur.");
  });
});
