import { describe, expect, it } from "vitest";

import { creditsToCents, formatBRL, parseBRLToCents, roundHalfUpDiv } from "@/lib/money";

describe("money", () => {
  it("formata centavos inteiros como BRL", () => {
    expect(formatBRL(4700).replace(/\u00a0/g, " ")).toBe("R$ 47,00");
    expect(formatBRL(0).replace(/\u00a0/g, " ")).toBe("R$ 0,00");
  });

  it("recusa valores não inteiros", () => {
    expect(() => formatBRL(47.5)).toThrow();
  });

  it("arredonda half-up com aritmética inteira", () => {
    expect(roundHalfUpDiv(735_377_500, 1000)).toBe(735_378);
    expect(roundHalfUpDiv(2_395_800_000, 1000)).toBe(2_395_800);
    expect(roundHalfUpDiv(1_629_144_500, 1000)).toBe(1_629_145);
    expect(roundHalfUpDiv(316_778_000, 1000)).toBe(316_778);
  });

  it("recusa denominador inválido", () => {
    expect(() => roundHalfUpDiv(100, 0)).toThrow();
  });

  it("converte créditos em centavos", () => {
    expect(creditsToCents(25)).toBe(2500);
    expect(creditsToCents(0)).toBe(0);
  });

  it("interpreta valores digitados em BRL sem float", () => {
    expect(parseBRLToCents("4.200,00")).toBe(420000);
    expect(parseBRLToCents("4200,50")).toBe(420050);
    expect(parseBRLToCents("4200.5")).toBe(420050);
    expect(parseBRLToCents("1234")).toBe(123400);
    expect(() => parseBRLToCents("")).toThrow();
  });
});
