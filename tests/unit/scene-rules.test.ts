import { describe, expect, it } from "vitest";

import {
  IMAGE_NEGATIVE,
  eventScene,
  eventSceneKey,
  sceneDirective,
  sceneRecipe,
  withFreshScene,
  withNvidiaAvoidance,
} from "@/lib/prospecting/scene-rules";

describe("regras da cena da isca", () => {
  it("usa o tipo do evento como tema (casamento, corporativo, festa infantil)", () => {
    expect(eventSceneKey("casamento")).toBe("casamento");
    expect(eventSceneKey("Corporativo (confraternização)")).toBe("corporativo");
    expect(eventSceneKey("Festa infantil")).toBe("festa_infantil");
    expect(eventSceneKey("15 anos")).toBe("quinze_anos");
    expect(eventSceneKey("aniversário")).toBe("aniversario");
    expect(eventSceneKey("batizado")).toBe("batizado");
    expect(eventSceneKey("formatura")).toBe("formatura");
    expect(eventScene("casamento")).toContain("wedding table");
    expect(eventScene("corporativo")).toContain("buffet");
    expect(eventScene("festa_infantil")).toContain("birthday cake");
  });

  it("nunca inclui pessoas e sempre pede uma cena estática", () => {
    for (const eventType of ["casamento", "corporativo", "festa_infantil", "15 anos"]) {
      const prompt = sceneDirective(0, eventType);
      expect(prompt).toContain("No people at all");
      expect(prompt).toContain("Static photograph");
      expect(prompt).toContain("no motion");
      expect(prompt).not.toContain("bride");
      expect(prompt).not.toContain("cast");
    }
    expect(IMAGE_NEGATIVE).toContain("people");
    expect(IMAGE_NEGATIVE).toContain("person");
    expect(IMAGE_NEGATIVE).toContain("hands");
    expect(IMAGE_NEGATIVE).toContain("faces");
  });

  it("rotaciona ângulo e paleta sem repetir a mesma composição", () => {
    const first = sceneRecipe(0, "casamento");
    const second = sceneRecipe(1, "casamento");
    expect(first.id).not.toBe(second.id);
    expect(first.angle).not.toBe(second.angle);
    expect(first.subject).toBe(second.subject);
    expect(sceneDirective(0, "casamento")).not.toBe(sceneDirective(1, "casamento"));
    expect(sceneDirective(0, "casamento")).toBe(sceneDirective(0, "casamento"));
  });

  it("acrescenta a cena e mantém o tipo do evento no prompt", () => {
    const prompt = withFreshScene("fotografia de buffet", 3, "corporativo");
    expect(prompt).toContain("fotografia de buffet");
    expect(prompt).toContain("corporate buffet table");
    expect(prompt).toContain("No text.");
  });

  it("grava Avoid no texto quando o provedor não tem campo negativo", () => {
    expect(withNvidiaAvoidance("a still table")).toContain("Avoid:");
    expect(withNvidiaAvoidance("a still table. Avoid: blur.")).toBe("a still table. Avoid: blur.");
  });
});
