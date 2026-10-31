import { describe, expect, it } from "vitest";

import { isValidInstagramHandle, normalizeInstagramHandle } from "@/lib/instagram-handle";

describe("instagram handle", () => {
  it("normaliza handles válidos (com ou sem @)", () => {
    expect(normalizeInstagramHandle("@seu.perfil")).toBe("seu.perfil");
    expect(normalizeInstagramHandle("SEU_PERFIL")).toBe("seu_perfil");
    expect(normalizeInstagramHandle("eventeia")).toBe("eventeia");
    expect(normalizeInstagramHandle("a.b_c1")).toBe("a.b_c1");
  });

  it("recusa inválidos", () => {
    expect(normalizeInstagramHandle("")).toBeNull();
    expect(normalizeInstagramHandle("   ")).toBeNull();
    expect(normalizeInstagramHandle(".comeca.ponto")).toBeNull();
    expect(normalizeInstagramHandle("termina.ponto.")).toBeNull();
    expect(normalizeInstagramHandle("dois..pontos")).toBeNull();
    expect(normalizeInstagramHandle("com espaço")).toBeNull();
    expect(normalizeInstagramHandle("caractere!")).toBeNull();
    expect(normalizeInstagramHandle("a".repeat(31))).toBeNull();
  });

  it("isValidInstagramHandle espelha a normalização", () => {
    expect(isValidInstagramHandle("@ok.handle")).toBe(true);
    expect(isValidInstagramHandle("inválido handle")).toBe(false);
  });
});
