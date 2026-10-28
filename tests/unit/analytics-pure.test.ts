import { describe, expect, it } from "vitest";

import { countByDay, lastNDays, maxCount, shortDay } from "@/lib/analytics/pure";

const NOW = new Date("2026-10-28T15:00:00Z");

describe("agregação de analytics", () => {
  it("lista os últimos dias no fuso de São Paulo", () => {
    const days = lastNDays(3, NOW);
    expect(days).toHaveLength(3);
    expect(days[2]).toBe("2026-10-28");
  });

  it("conta por dia e preenche zeros", () => {
    const points = countByDay(
      [
        { created_at: "2026-10-28T15:00:00Z" },
        { created_at: "2026-10-28T16:00:00Z" },
        { created_at: "2026-10-27T15:00:00Z" },
      ],
      3,
      NOW,
    );
    expect(points.map((p) => p.count)).toEqual([0, 1, 2]);
  });

  it("escala do gráfico nunca é zero", () => {
    expect(maxCount([{ day: "2026-10-28", count: 0 }])).toBe(1);
    expect(maxCount([{ day: "2026-10-28", count: 7 }])).toBe(7);
  });

  it("formata o dia curto", () => {
    expect(shortDay("2026-10-28")).toBe("28/10");
  });
});
