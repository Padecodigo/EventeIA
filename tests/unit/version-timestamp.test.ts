import { describe, expect, it } from "vitest";

import { nextVersionTimestamp } from "@/lib/prospecting/version-timestamp";

describe("nextVersionTimestamp", () => {
  it("avança 1ms quando o relógio está igual ou atrás da versão lida", () => {
    const previous = "2026-11-07T00:00:00.500Z";
    expect(nextVersionTimestamp(previous, new Date("2026-11-07T00:00:00.500Z"))).toBe(
      "2026-11-07T00:00:00.501Z",
    );
    expect(nextVersionTimestamp(previous, new Date("2026-11-07T00:00:00.100Z"))).toBe(
      "2026-11-07T00:00:00.501Z",
    );
  });

  it("lida com precisão de microssegundos e offset +00:00", () => {
    const previous = "2026-11-07T00:00:00.500999+00:00";
    const next = nextVersionTimestamp(previous, new Date("2026-11-07T00:00:00.500Z"));
    expect(Date.parse(next)).toBeGreaterThan(Date.parse(previous));
    expect(next).toBe("2026-11-07T00:00:00.501Z");
  });

  it("sem versão anterior usa o relógio atual", () => {
    expect(nextVersionTimestamp(null, new Date("2026-11-07T00:00:00.500Z"))).toBe(
      "2026-11-07T00:00:00.500Z",
    );
  });
});
