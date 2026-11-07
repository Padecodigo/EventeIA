import { describe, expect, it } from "vitest";

import { themeForHour } from "@/lib/marketing/themes";

describe("temas do autopilot", () => {
  it("usa 6 imagens únicas nos 6 slots de 4h do dia", () => {
    const keys = [0, 4, 8, 12, 16, 20].map((h) => themeForHour(h).key);
    expect(new Set(keys).size).toBe(6);
    // mesmo slot em horas adjacentes repete (4h e 5h → mesmo tema)
    expect(themeForHour(4).key).toBe(themeForHour(5).key);
    expect(themeForHour(0).key).not.toBe(themeForHour(4).key);
  });

  it("dayOffset embaralha a ordem entre dias sem repetir no mesmo dia", () => {
    const dayA = [0, 4, 8, 12, 16, 20].map((h) => themeForHour(h, 1).key);
    const dayB = [0, 4, 8, 12, 16, 20].map((h) => themeForHour(h, 2).key);
    expect(new Set(dayA).size).toBe(6);
    expect(new Set(dayB).size).toBe(6);
    expect(dayA.join(",")).not.toBe(dayB.join(","));
  });
});
