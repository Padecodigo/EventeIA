import { describe, expect, it } from "vitest";

import { ENGINE_VERSION, calculate } from "@/lib/engine";
import type { EngineInput } from "@/lib/engine/types";

const baseInput: EngineInput = {
  eventType: "casamento",
  guestCount: 120,
  eventDateIso: "2026-11-20",
  leadTimeDays: 45,
  region: "sp",
  items: [
    { category: "buffet" },
    { category: "decoracao" },
    { category: "musica" },
    { category: "fotografia" },
    { category: "espaco" },
  ],
};

describe("motor financeiro determinístico", () => {
  it("produz os valores golden da versão 1.0.0", () => {
    const result = calculate(baseInput);

    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.totalCents).toBe(4_764_980);
    expect(result.minTotalCents).toBe(4_050_234);
    expect(result.maxTotalCents).toBe(5_956_226);

    expect(result.breakdown.map((line) => line.suggestedCents)).toEqual([
      1_916_640, 865_150, 332_750, 372_680, 1_277_760,
    ]);
  });

  it("é determinístico: mesma entrada ⇒ mesma saída", () => {
    const first = calculate(baseInput);
    const second = calculate(baseInput);
    expect(second).toEqual(first);
  });

  it("soma do breakdown bate com o total", () => {
    const result = calculate(baseInput);
    const sum = result.breakdown.reduce((total, line) => total + line.suggestedCents, 0);
    expect(sum).toBe(result.totalCents);
  });

  it("sinaliza urgência e alta temporada", () => {
    const urgent = calculate({ ...baseInput, leadTimeDays: 10 });
    expect(urgent.warnings.map((warning) => warning.code)).toContain("urgency");
    expect(urgent.totalCents).toBeGreaterThan(calculate(baseInput).totalCents);
    expect(urgent.warnings.map((warning) => warning.code)).toContain("peak_season");
  });

  it("sinaliza evento de grande porte", () => {
    const large = calculate({ ...baseInput, guestCount: 800 });
    expect(large.warnings.map((warning) => warning.code)).toContain("large_event");
  });

  it("aplica preferências por item", () => {
    const economic = calculate({
      ...baseInput,
      preferences: { buffet: "economico" },
    });
    const premium = calculate({
      ...baseInput,
      preferences: { buffet: "premium" },
    });
    expect(economic.breakdown[0]?.suggestedCents).toBeLessThan(
      premium.breakdown[0]?.suggestedCents ?? 0,
    );
  });

  it("suporta festa infantil e 15 anos com fatores próprios", () => {
    const kids = calculate({ ...baseInput, eventType: "festa_infantil" });
    const teens = calculate({ ...baseInput, eventType: "quinze_anos" });
    const wedding = calculate(baseInput);

    expect(kids.totalCents).toBeLessThan(teens.totalCents);
    expect(kids.totalCents).toBeLessThan(wedding.totalCents);
    expect(kids.engineVersion).toBe(ENGINE_VERSION);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => calculate({ ...baseInput, guestCount: 0 })).toThrow();
    expect(() => calculate({ ...baseInput, eventDateIso: "20/11/2026" })).toThrow();
    expect(() =>
      calculate({
        ...baseInput,
        items: [{ category: "buffet" }, { category: "buffet" }],
      }),
    ).toThrow();
    expect(() => calculate({ ...baseInput, items: [] })).toThrow();
  });
});
