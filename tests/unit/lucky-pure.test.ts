import { describe, expect, it } from "vitest";

import {
  drawLuckyPercent,
  isLuckyCode,
  isValidLuckyPercent,
  LUCKY_MAX_PERCENT,
  LUCKY_MIN_PERCENT,
  luckyDiscountCents,
} from "@/lib/lucky/pure";

describe("cupom sorteado — regras puras", () => {
  it("sorteia inteiros entre 20 e 40 (inclusive) com crypto.randomInt", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      const v = drawLuckyPercent();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(40);
      seen.add(v);
    }
    expect(seen.has(20)).toBe(true);
    expect(seen.has(40)).toBe(true);
    expect(seen.size).toBe(21);
  });

  it("passa limites [20, 41) ao gerador (máximo exclusivo) e rejeita valor fora", () => {
    const calls: number[][] = [];
    expect(drawLuckyPercent((min, max) => (calls.push([min, max]), max - 1))).toBe(40);
    expect(calls[0]).toEqual([LUCKY_MIN_PERCENT, LUCKY_MAX_PERCENT + 1]);
    expect(drawLuckyPercent((min) => min)).toBe(20);
    expect(() => drawLuckyPercent(() => 41)).toThrow();
    expect(() => drawLuckyPercent(() => 19)).toThrow();
  });

  it("valida percentual", () => {
    expect(isValidLuckyPercent(20)).toBe(true);
    expect(isValidLuckyPercent(40)).toBe(true);
    expect(isValidLuckyPercent(19)).toBe(false);
    expect(isValidLuckyPercent(41)).toBe(false);
    expect(isValidLuckyPercent(25.5)).toBe(false);
    expect(isValidLuckyPercent("30")).toBe(false);
  });

  it("calcula o desconto no tíquete de R$ 97", () => {
    expect(luckyDiscountCents(9700, 20)).toBe(1940);
    expect(luckyDiscountCents(9700, 40)).toBe(3880);
    expect(luckyDiscountCents(9700, 33)).toBe(3201);
    expect(() => luckyDiscountCents(9700, 50)).toThrow();
    expect(() => luckyDiscountCents(0, 30)).toThrow();
  });

  it("reconhece o prefixo do código", () => {
    expect(isLuckyCode("SORTE-ABCD1234")).toBe(true);
    expect(isLuckyCode("BEMVINDO-X")).toBe(false);
    expect(isLuckyCode(null)).toBe(false);
  });
});
