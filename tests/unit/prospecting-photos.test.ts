import { describe, expect, it } from "vitest";

import { artForEventType, photoForEventType, photoKeyForEventType } from "@/lib/prospecting/photos";

describe("foto por tipo de evento", () => {
  it("mapeia os tipos para o acervo", () => {
    expect(photoKeyForEventType("infantil")).toBe("infantil");
    expect(photoKeyForEventType("Festa de 15 anos")).toBe("15-anos");
    expect(photoKeyForEventType("casamento")).toBe("casamento");
    expect(photoKeyForEventType("formatura")).toBe("formatura");
    expect(photoKeyForEventType("corporativo")).toBe("corporativo");
    expect(photoKeyForEventType("aniversário")).toBe("aniversario");
  });

  it("aponta para a arte com a marca por tipo", () => {
    expect(artForEventType("casamento")).toBe("/brand/posts/casamento.jpg");
    expect(artForEventType("Festa de 15 anos")).toBe("/brand/posts/15-anos.jpg");
  });

  it("tem fallback para tipo desconhecido", () => {
    expect(photoForEventType("batizado")).toContain("/img/eventos/");
  });
});
