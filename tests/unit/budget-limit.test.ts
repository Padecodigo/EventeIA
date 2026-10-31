import { describe, expect, it } from "vitest";

import {
  formatBudgetLimitInput,
  isAboveBudgetLimit,
  optionEventTotalCents,
  parseBudgetLimitInput,
} from "@/lib/events/budget-limit";

describe("parseBudgetLimitInput", () => {
  it("vazio/ausente = sem limite", () => {
    expect(parseBudgetLimitInput(null)).toEqual({ ok: true, cents: null });
    expect(parseBudgetLimitInput("")).toEqual({ ok: true, cents: null });
    expect(parseBudgetLimitInput("   ")).toEqual({ ok: true, cents: null });
  });

  it("aceita formatos BRL comuns", () => {
    expect(parseBudgetLimitInput("25000")).toEqual({ ok: true, cents: 2_500_000 });
    expect(parseBudgetLimitInput("25.000")).toEqual({ ok: true, cents: 2_500_000 });
    expect(parseBudgetLimitInput("25.000,50")).toEqual({ ok: true, cents: 2_500_050 });
    expect(parseBudgetLimitInput("R$ 1.250.000,5")).toEqual({ ok: true, cents: 125_000_050 });
  });

  it("rejeita texto, negativo, decimal com ponto ambíguo e fora da faixa", () => {
    for (const raw of ["abc", "-100", "25.00", "1,234", "99,99", "2.000.000.000"]) {
      expect(parseBudgetLimitInput(raw).ok, raw).toBe(false);
    }
  });

  it("formata para o campo de edição", () => {
    expect(formatBudgetLimitInput(null)).toBe("");
    expect(formatBudgetLimitInput(2_500_000)).toBe("25.000,00");
  });
});

describe("sinalização acima do limite (preço total do evento)", () => {
  it("por pessoa multiplica pelos convidados", () => {
    expect(optionEventTotalCents(8_900, "por_pessoa", 100)).toBe(890_000);
    expect(optionEventTotalCents(15_000, "pacote", 100)).toBe(15_000);
    expect(optionEventTotalCents(null, "pacote", 100)).toBeNull();
  });

  it("sinaliza só quando o total passa do limite", () => {
    expect(isAboveBudgetLimit(8_900, "por_pessoa", 100, 800_000)).toBe(true);
    expect(isAboveBudgetLimit(8_000, "por_pessoa", 100, 800_000)).toBe(false); // igual ao limite
    expect(isAboveBudgetLimit(900_000, "pacote", 100, 800_000)).toBe(true);
  });

  it("sem limite ou preço a combinar nunca sinaliza", () => {
    expect(isAboveBudgetLimit(99_999_999, "pacote", 100, null)).toBe(false);
    expect(isAboveBudgetLimit(null, "pacote", 100, 1)).toBe(false);
  });
});
