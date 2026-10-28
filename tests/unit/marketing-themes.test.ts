import { describe, expect, it } from "vitest";

import { themeForHour } from "@/lib/marketing/themes";

describe("temas do autopilot", () => {
  it("rotaciona por hora", () => {
    const keys = [0, 1, 2, 3, 4].map((h) => themeForHour(h).key);
    expect(new Set(keys).size).toBe(5);
    expect(themeForHour(5).key).toBe(themeForHour(0).key);
  });
});
